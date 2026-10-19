import { adminDb, adminAuth } from "../lib/firebaseadmin.js";
import {
  generateCode, normalizeCode, normalizePhone, normalizeEmail, inviteKey, MAX_ROSTER_ROWS,
  summarizeStudent, summarizeGroup,
} from "../lib/collegeStats.js";

// College / teacher dashboards. One function with an `action` field (keeps the Vercel
// function count down). Roles live ONLY in server-written collections — never on
// users/{uid}, which the client writes freely and could use to self-promote:
//
//   colleges/{collegeId}                          { name, city, createdBy, createdAt, teacherCode }
//   colleges/{collegeId}/classes/{classId}        { name, exam, teacherUid, teacherName, joinCode, createdAt }
//   colleges/{collegeId}/announcements/{id}       { classId|null, title, body, authorUid, authorName, ts }
//   memberships/{uid}                             { collegeId, role: "admin"|"teacher"|"student", classId, name, rollNo, email, joinedAt }
//   joinCodes/{CODE}                              { collegeId, role: "teacher"|"student", classId }
//   invites/{"phone:+91…"|"email:…"}              { collegeId, classId, name, rollNo, phone, email, invitedBy, createdAt }
//
// Staff use the separate portal at /staff/; students use "My College" in the main app.
// Invites are pending until the student accepts them, so a teacher can't see anyone's
// progress just by typing in their phone number.
//
// Firestore security rules should deny all client access to these collections.

const EXAMS = ["NEET", "JEE", "KCET", "PUC"];
const MOCK_RESULTS_PER_STUDENT = 20;
const READ_CONCURRENCY = 25;
const ANNOUNCEMENTS_SHOWN = 30;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function cleanText(value, max = 80) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function getCaller(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new HttpError(401, "Please sign in again.");
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (decoded.firebase?.sign_in_provider === "anonymous") {
      throw new HttpError(403, "Sign in with Google, mobile number or email to use college features.");
    }
    return {
      uid: decoded.uid,
      name: cleanText(decoded.name || decoded.email || decoded.phone_number || "Member", 60),
      email: decoded.email || null,
      phone: decoded.phone_number || null,
      // Only a verified email may claim an email invite — anyone can sign up with an
      // unverified address and would otherwise grab someone else's seat.
      verifiedEmail: decoded.email_verified && decoded.email ? decoded.email.toLowerCase() : null,
    };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(401, "Your session expired. Please sign in again.");
  }
}

function callerInviteKeys(caller) {
  const keys = [];
  if (caller.phone) keys.push(inviteKey({ phone: caller.phone }));
  if (caller.verifiedEmail) keys.push(inviteKey({ email: caller.verifiedEmail }));
  return keys;
}

async function getMembership(uid) {
  const snap = await adminDb.collection("memberships").doc(uid).get();
  return snap.exists ? snap.data() : null;
}

function requireRole(membership, ...roles) {
  if (!membership || !roles.includes(membership.role)) throw new HttpError(403, "You don't have access to this.");
}

// Reserves a join code that isn't already in use, inside the given transaction.
async function reserveCode(tx, payload) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateCode(6);
    const ref = adminDb.collection("joinCodes").doc(code);
    const existing = await tx.get(ref);
    if (!existing.exists) {
      tx.set(ref, { ...payload, createdAt: Date.now() });
      return code;
    }
  }
  throw new HttpError(500, "Couldn't generate a join code. Please try again.");
}

function collegeRef(collegeId) {
  return adminDb.collection("colleges").doc(collegeId);
}

async function getClassOrThrow(collegeId, classId) {
  if (!classId) throw new HttpError(400, "Missing class.");
  const ref = collegeRef(collegeId).collection("classes").doc(String(classId));
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, "That class no longer exists.");
  return { ref, data: snap.data() };
}

// Teachers may only act on classes they teach; admins on any class in their college.
async function getManagedClass(caller, membership, classId) {
  const cls = await getClassOrThrow(membership.collegeId, classId);
  if (membership.role === "teacher" && cls.data.teacherUid !== caller.uid) throw new HttpError(403, "You can only manage your own classes.");
  return cls;
}

async function inBatches(items, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += READ_CONCURRENCY) {
    out.push(...(await Promise.all(items.slice(i, i + READ_CONCURRENCY).map((item, j) => fn(item, i + j)))));
  }
  return out;
}

async function loadStudentSummaries(members) {
  if (members.length === 0) return [];
  const now = Date.now();
  const userSnaps = await adminDb.getAll(...members.map((m) => adminDb.collection("users").doc(m.uid)));
  return inBatches(members, async (m, i) => {
    const resultsSnap = await adminDb
      .collection("users").doc(m.uid).collection("mockTestResults")
      .orderBy("ts", "desc").limit(MOCK_RESULTS_PER_STUDENT).get();
    return summarizeStudent(m, userSnaps[i].data(), resultsSnap.docs.map((d) => d.data()), now);
  });
}

async function listCollegeMembers(collegeId) {
  const snap = await adminDb.collection("memberships").where("collegeId", "==", collegeId).get();
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

async function listClasses(collegeId) {
  const snap = await collegeRef(collegeId).collection("classes").orderBy("createdAt", "asc").get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function listInvites(collegeId) {
  const snap = await adminDb.collection("invites").where("collegeId", "==", collegeId).get();
  return snap.docs.map((d) => ({ key: d.id, ...d.data() }));
}

async function listAnnouncements(collegeId) {
  const snap = await collegeRef(collegeId).collection("announcements").orderBy("ts", "desc").limit(100).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Pending invites addressed to the caller's phone / verified email, with names to show.
async function invitesForCaller(caller) {
  const keys = callerInviteKeys(caller);
  if (keys.length === 0) return [];
  const snaps = await adminDb.getAll(...keys.map((k) => adminDb.collection("invites").doc(k)));
  const invites = snaps.filter((s) => s.exists).map((s) => ({ key: s.id, ...s.data() }));
  return Promise.all(invites.map(async (inv) => {
    const [college, cls] = await Promise.all([
      collegeRef(inv.collegeId).get(),
      collegeRef(inv.collegeId).collection("classes").doc(inv.classId).get(),
    ]);
    return {
      key: inv.key, collegeName: college.data()?.name || "A college", city: college.data()?.city || "",
      className: cls.data()?.name || "", teacherName: cls.data()?.teacherName || null, invitedByName: inv.invitedByName || null,
    };
  }));
}

// ---- membership ------------------------------------------------------------

async function me(caller) {
  const membership = await getMembership(caller.uid);
  if (!membership) return { membership: null, invites: (await invitesForCaller(caller)).length };
  const college = await collegeRef(membership.collegeId).get();
  return { membership: { role: membership.role, collegeId: membership.collegeId, collegeName: college.data()?.name || "" }, invites: 0 };
}

async function createCollege(caller, body) {
  const name = cleanText(body.name);
  const city = cleanText(body.city, 60);
  if (name.length < 3) throw new HttpError(400, "Please enter the college's full name.");

  return adminDb.runTransaction(async (tx) => {
    const memberRef = adminDb.collection("memberships").doc(caller.uid);
    if ((await tx.get(memberRef)).exists) throw new HttpError(409, "This account already belongs to a college. Use a different account to register a new one.");

    const ref = adminDb.collection("colleges").doc();
    const teacherCode = await reserveCode(tx, { collegeId: ref.id, role: "teacher", classId: null });
    tx.set(ref, { name, city, createdBy: caller.uid, createdAt: Date.now(), teacherCode });
    tx.set(memberRef, { collegeId: ref.id, role: "admin", classId: null, name: caller.name, email: caller.email, joinedAt: Date.now() });
    return { collegeId: ref.id };
  });
}

// body.portal: "staff" (accepts teacher codes) | anything else (student app — class codes).
async function join(caller, body) {
  const code = normalizeCode(body.code);
  if (code.length < 4) throw new HttpError(400, "Please enter the code your college or teacher gave you.");
  const staffPortal = body.portal === "staff";
  const ownInviteRefs = callerInviteKeys(caller).map((k) => adminDb.collection("invites").doc(k));

  return adminDb.runTransaction(async (tx) => {
    const codeSnap = await tx.get(adminDb.collection("joinCodes").doc(code));
    if (!codeSnap.exists) throw new HttpError(404, "That code doesn't match any college or class. Check it and try again.");
    const target = codeSnap.data();
    if (staffPortal && target.role !== "teacher") throw new HttpError(400, "That's a class code for students. Teachers need the teacher code from their college admin.");
    if (!staffPortal && target.role === "teacher") throw new HttpError(400, "That's a teacher code. Teachers sign in at the iBuddie staff portal (/staff).");

    const memberRef = adminDb.collection("memberships").doc(caller.uid);
    const existing = (await tx.get(memberRef)).data();
    const inviteSnaps = ownInviteRefs.length ? await tx.getAll(...ownInviteRefs) : [];
    if (existing && existing.collegeId !== target.collegeId) throw new HttpError(409, "This account already belongs to another college. Leave it first.");
    if (existing?.role === "admin") throw new HttpError(409, "You're this college's admin already.");
    if (existing?.role === "teacher") throw new HttpError(409, staffPortal ? "You're already a teacher here." : "Teacher accounts can't join a class as a student.");

    const base = { collegeId: target.collegeId, name: existing?.name || caller.name, email: caller.email, joinedAt: existing?.joinedAt || Date.now() };
    if (target.role === "teacher") {
      if (existing) throw new HttpError(409, "This account is a student account. Use a separate account for teaching.");
      tx.set(memberRef, { ...base, role: "teacher", classId: null, rollNo: "" });
    } else {
      tx.set(memberRef, { ...base, role: "student", classId: target.classId, rollNo: existing?.rollNo || "" });
      // Joining by code supersedes any invite the student had from this college.
      for (const s of inviteSnaps) if (s.exists && s.data().collegeId === target.collegeId) tx.delete(s.ref);
    }
    return { role: target.role };
  });
}

async function respondInvite(caller, body, accept) {
  const key = String(body.key || "");
  if (!callerInviteKeys(caller).includes(key)) throw new HttpError(403, "That invite isn't for this account.");
  const inviteRef = adminDb.collection("invites").doc(key);

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(inviteRef);
    if (!snap.exists) throw new HttpError(404, "That invite was withdrawn.");
    const inv = snap.data();
    const memberRef = adminDb.collection("memberships").doc(caller.uid);
    const existing = await tx.get(memberRef);
    if (accept) {
      if (existing.exists) throw new HttpError(409, "This account already belongs to a college. Leave it first.");
      tx.set(memberRef, {
        collegeId: inv.collegeId, role: "student", classId: inv.classId, name: inv.name || caller.name,
        rollNo: inv.rollNo || "", email: caller.email, joinedAt: Date.now(),
      });
    }
    tx.delete(inviteRef);
    return { ok: true };
  });
}

async function leave(caller, membership) {
  requireRole(membership, "teacher", "student");
  const batch = adminDb.batch();
  batch.delete(adminDb.collection("memberships").doc(caller.uid));
  if (membership.role === "teacher") {
    // Unassign them from their classes so the admin can hand those classes to someone else.
    for (const c of await listClasses(membership.collegeId)) {
      if (c.teacherUid === caller.uid) {
        batch.update(collegeRef(membership.collegeId).collection("classes").doc(c.id), { teacherUid: null, teacherName: null });
      }
    }
  }
  await batch.commit();
  return { ok: true };
}

// ---- classes ---------------------------------------------------------------

async function resolveTeacher(collegeId, teacherUid) {
  if (!teacherUid) return { teacherUid: null, teacherName: null };
  const m = await getMembership(teacherUid);
  if (!m || m.collegeId !== collegeId || !["teacher", "admin"].includes(m.role)) throw new HttpError(400, "That teacher isn't part of your college.");
  return { teacherUid, teacherName: m.name };
}

async function createClass(caller, membership, body) {
  requireRole(membership, "admin", "teacher");
  const name = cleanText(body.name, 60);
  const exam = EXAMS.includes(body.exam) ? body.exam : "NEET";
  if (name.length < 2) throw new HttpError(400, "Give the class a name, e.g. \"2nd PUC – Section A\".");

  // Teachers always own the classes they create; admins may assign anyone (or nobody yet).
  const teacher = membership.role === "teacher"
    ? { teacherUid: caller.uid, teacherName: membership.name }
    : await resolveTeacher(membership.collegeId, body.teacherUid);

  return adminDb.runTransaction(async (tx) => {
    const classRef = collegeRef(membership.collegeId).collection("classes").doc();
    const joinCode = await reserveCode(tx, { collegeId: membership.collegeId, role: "student", classId: classRef.id });
    tx.set(classRef, { name, exam, ...teacher, joinCode, createdAt: Date.now() });
    return { classId: classRef.id, joinCode };
  });
}

async function updateClass(caller, membership, body) {
  requireRole(membership, "admin", "teacher");
  const { ref } = await getManagedClass(caller, membership, body.classId);

  const update = {};
  if (body.name !== undefined) {
    const name = cleanText(body.name, 60);
    if (name.length < 2) throw new HttpError(400, "Class name is too short.");
    update.name = name;
  }
  if (body.exam !== undefined && EXAMS.includes(body.exam)) update.exam = body.exam;
  if (body.teacherUid !== undefined) {
    requireRole(membership, "admin");
    Object.assign(update, await resolveTeacher(membership.collegeId, body.teacherUid));
  }
  await ref.update(update);
  return { ok: true };
}

async function deleteClass(caller, membership, body) {
  requireRole(membership, "admin");
  const { ref, data } = await getClassOrThrow(membership.collegeId, body.classId);
  const batch = adminDb.batch();
  batch.delete(ref);
  if (data.joinCode) batch.delete(adminDb.collection("joinCodes").doc(data.joinCode));
  // Students stay in the college but drop out of the deleted class; pending invites to it are withdrawn.
  for (const m of await listCollegeMembers(membership.collegeId)) {
    if (m.role === "student" && m.classId === ref.id) batch.update(adminDb.collection("memberships").doc(m.uid), { classId: null });
  }
  for (const inv of await listInvites(membership.collegeId)) {
    if (inv.classId === ref.id) batch.delete(adminDb.collection("invites").doc(inv.key));
  }
  await batch.commit();
  return { ok: true };
}

async function regenerateCode(caller, membership, body) {
  requireRole(membership, "admin", "teacher");

  if (body.target === "teacher") {
    requireRole(membership, "admin");
    const ref = collegeRef(membership.collegeId);
    return adminDb.runTransaction(async (tx) => {
      const old = (await tx.get(ref)).data()?.teacherCode;
      const code = await reserveCode(tx, { collegeId: membership.collegeId, role: "teacher", classId: null });
      if (old) tx.delete(adminDb.collection("joinCodes").doc(old));
      tx.update(ref, { teacherCode: code });
      return { code };
    });
  }

  const { ref, data } = await getManagedClass(caller, membership, body.target);
  return adminDb.runTransaction(async (tx) => {
    const code = await reserveCode(tx, { collegeId: membership.collegeId, role: "student", classId: ref.id });
    if (data.joinCode) tx.delete(adminDb.collection("joinCodes").doc(data.joinCode));
    tx.update(ref, { joinCode: code });
    return { code };
  });
}

// ---- students --------------------------------------------------------------

// rows: [{ name, phone?, email?, rollNo? }] — re-validated here; the client's parse is only a preview.
async function addStudents(caller, membership, body) {
  requireRole(membership, "admin", "teacher");
  const { data: cls, ref: classRef } = await getManagedClass(caller, membership, body.classId);
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_ROSTER_ROWS) : [];
  if (rows.length === 0) throw new HttpError(400, "Add at least one student with a mobile number or email.");

  const skipped = [];
  const clean = [];
  const seen = new Set();
  for (const r of rows) {
    const phone = normalizePhone(r.phone);
    const email = phone ? null : normalizeEmail(r.email);
    const contact = phone || email || String(r.phone || r.email || "");
    const name = cleanText(r.name, 60) || "Student";
    if (!phone && !email) { skipped.push({ name, contact, reason: "No valid mobile number or email" }); continue; }
    const key = inviteKey({ phone, email });
    if (seen.has(key)) { skipped.push({ name, contact, reason: "Listed twice" }); continue; }
    seen.add(key);
    clean.push({ key, name, phone, email, rollNo: cleanText(r.rollNo, 20), contact });
  }

  // Students who already have an iBuddie account may already be in a college.
  const lookup = clean.map((r) => (r.phone ? { phoneNumber: r.phone } : { email: r.email }));
  const found = new Map();
  for (let i = 0; i < lookup.length; i += 100) {
    const { users } = await adminAuth.getUsers(lookup.slice(i, i + 100));
    for (const u of users) {
      if (u.phoneNumber) found.set(inviteKey({ phone: u.phoneNumber }), u.uid);
      if (u.email) found.set(inviteKey({ email: u.email.toLowerCase() }), u.uid);
    }
  }
  const uids = [...new Set(clean.map((r) => found.get(r.key)).filter(Boolean))];
  const memberSnaps = uids.length ? await adminDb.getAll(...uids.map((u) => adminDb.collection("memberships").doc(u))) : [];
  const memberByUid = new Map(memberSnaps.map((s) => [s.id, s.exists ? s.data() : null]));
  const inviteSnaps = clean.length ? await adminDb.getAll(...clean.map((r) => adminDb.collection("invites").doc(r.key))) : [];

  const batch = adminDb.batch();
  let invited = 0;
  let updated = 0;
  clean.forEach((r, i) => {
    const m = memberByUid.get(found.get(r.key));
    if (m) {
      const reason = m.collegeId !== membership.collegeId ? "Already belongs to another college"
        : m.role !== "student" ? "This is a staff account"
        : m.classId === classRef.id ? "Already in this class" : "Already in your college — use Move to change class";
      skipped.push({ name: r.name, contact: r.contact, reason });
      return;
    }
    const pending = inviteSnaps[i].exists ? inviteSnaps[i].data() : null;
    if (pending && pending.collegeId !== membership.collegeId) {
      skipped.push({ name: r.name, contact: r.contact, reason: "Has a pending invite from another college" });
      return;
    }
    batch.set(adminDb.collection("invites").doc(r.key), {
      collegeId: membership.collegeId, classId: classRef.id, name: r.name, rollNo: r.rollNo, phone: r.phone, email: r.email,
      invitedBy: caller.uid, invitedByName: membership.name, createdAt: pending?.createdAt || Date.now(),
    });
    if (pending) updated++;
    else invited++;
  });
  await batch.commit();
  return { invited, updated, skipped, className: cls.name };
}

async function cancelInvite(caller, membership, body) {
  requireRole(membership, "admin", "teacher");
  const ref = adminDb.collection("invites").doc(String(body.key || ""));
  const snap = await ref.get();
  if (!snap.exists || snap.data().collegeId !== membership.collegeId) throw new HttpError(404, "That invite no longer exists.");
  await getManagedClass(caller, membership, snap.data().classId);
  await ref.delete();
  return { ok: true };
}

async function getManagedStudent(caller, membership, uid) {
  const target = await getMembership(String(uid || ""));
  if (!target || target.collegeId !== membership.collegeId || target.role !== "student") throw new HttpError(404, "That student isn't in your college.");
  if (membership.role === "teacher") {
    if (!target.classId) throw new HttpError(403, "That student isn't in one of your classes.");
    await getManagedClass(caller, membership, target.classId);
  }
  return target;
}

async function updateStudent(caller, membership, body) {
  requireRole(membership, "admin", "teacher");
  await getManagedStudent(caller, membership, body.uid);

  const update = {};
  if (body.name !== undefined) {
    const name = cleanText(body.name, 60);
    if (name.length < 2) throw new HttpError(400, "Name is too short.");
    update.name = name;
  }
  if (body.rollNo !== undefined) update.rollNo = cleanText(body.rollNo, 20);
  if (body.classId !== undefined) {
    // Teachers can move students only between classes they teach.
    await getManagedClass(caller, membership, body.classId);
    update.classId = String(body.classId);
  }
  await adminDb.collection("memberships").doc(String(body.uid)).update(update);
  return { ok: true };
}

async function removeMember(caller, membership, body) {
  requireRole(membership, "admin", "teacher");
  const uid = String(body.uid || "");
  if (!uid || uid === caller.uid) throw new HttpError(400, "You can't remove yourself here.");
  const target = await getMembership(uid);
  if (!target || target.collegeId !== membership.collegeId) throw new HttpError(404, "That person isn't in your college.");
  if (target.role === "admin") throw new HttpError(403, "Admins can't be removed.");
  if (target.role === "teacher") requireRole(membership, "admin");
  else await getManagedStudent(caller, membership, uid);

  if (target.role === "teacher") await leave({ uid }, target);
  else await adminDb.collection("memberships").doc(uid).delete();
  return { ok: true };
}

// ---- teachers --------------------------------------------------------------

// Creates the teacher's sign-in account if needed. The admin's browser then sends Firebase's
// password-reset email so the teacher sets their own password — the admin never handles it.
async function addTeacher(caller, membership, body) {
  requireRole(membership, "admin");
  const email = normalizeEmail(body.email);
  if (!email) throw new HttpError(400, "Enter the teacher's email address.");
  const name = cleanText(body.name, 60);
  if (name.length < 2) throw new HttpError(400, "Enter the teacher's name.");

  let user;
  let created = false;
  try {
    user = await adminAuth.getUserByEmail(email);
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
    user = await adminAuth.createUser({ email, displayName: name });
    created = true;
  }

  const memberRef = adminDb.collection("memberships").doc(user.uid);
  await adminDb.runTransaction(async (tx) => {
    const existing = (await tx.get(memberRef)).data();
    if (existing?.collegeId === membership.collegeId) {
      throw new HttpError(409, existing.role === "student" ? "That email belongs to a student in your college." : "That person is already on your staff.");
    }
    if (existing) throw new HttpError(409, "That email already belongs to another college.");
    tx.set(memberRef, { collegeId: membership.collegeId, role: "teacher", classId: null, name, rollNo: "", email, joinedAt: Date.now(), addedBy: caller.uid });
  });
  return { uid: user.uid, email, created };
}

// ---- announcements ---------------------------------------------------------

async function postAnnouncement(caller, membership, body) {
  requireRole(membership, "admin", "teacher");
  const title = cleanText(body.title, 100);
  const text = String(body.body || "").trim().slice(0, 2000);
  if (title.length < 2) throw new HttpError(400, "Add a short title.");
  const classId = body.classId ? String(body.classId) : null;
  if (classId) await getManagedClass(caller, membership, classId);
  else requireRole(membership, "admin"); // college-wide notices are admin-only

  const ref = await collegeRef(membership.collegeId).collection("announcements").add({
    classId, title, body: text, authorUid: caller.uid, authorName: membership.name, ts: Date.now(),
  });
  return { id: ref.id };
}

async function deleteAnnouncement(caller, membership, body) {
  requireRole(membership, "admin", "teacher");
  const ref = collegeRef(membership.collegeId).collection("announcements").doc(String(body.id || ""));
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, "That announcement was already removed.");
  if (membership.role !== "admin" && snap.data().authorUid !== caller.uid) throw new HttpError(403, "You can only remove your own announcements.");
  await ref.delete();
  return { ok: true };
}

// ---- dashboard -------------------------------------------------------------

async function dashboard(caller, membership) {
  if (!membership) return { role: null, invites: await invitesForCaller(caller) };
  const collegeSnap = await collegeRef(membership.collegeId).get();
  if (!collegeSnap.exists) throw new HttpError(404, "Your college was removed.");
  const college = collegeSnap.data();
  const [classes, members, announcements] = await Promise.all([
    listClasses(membership.collegeId), listCollegeMembers(membership.collegeId), listAnnouncements(membership.collegeId),
  ]);

  if (membership.role === "student") {
    const cls = classes.find((c) => c.id === membership.classId);
    return {
      role: "student",
      college: { name: college.name, city: college.city },
      class: cls ? { name: cls.name, exam: cls.exam, teacherName: cls.teacherName } : null,
      rollNo: membership.rollNo || "",
      announcements: announcements
        .filter((a) => !a.classId || a.classId === membership.classId)
        .slice(0, ANNOUNCEMENTS_SHOWN)
        .map(({ id, title, body, authorName, ts, classId }) => ({ id, title, body, authorName, ts, collegeWide: !classId })),
    };
  }

  const isAdmin = membership.role === "admin";
  const visibleClasses = isAdmin ? classes : classes.filter((c) => c.teacherUid === caller.uid);
  const visibleIds = new Set(visibleClasses.map((c) => c.id));
  const studentMembers = members.filter((m) => m.role === "student" && (isAdmin || visibleIds.has(m.classId)));
  const [students, invites] = await Promise.all([loadStudentSummaries(studentMembers), listInvites(membership.collegeId)]);

  const payload = {
    role: membership.role,
    me: { uid: caller.uid, name: membership.name },
    college: { name: college.name, city: college.city },
    classes: visibleClasses.map((c) => ({
      id: c.id, name: c.name, exam: c.exam, teacherUid: c.teacherUid || null, teacherName: c.teacherName || null,
      joinCode: c.joinCode, summary: summarizeGroup(students.filter((s) => s.classId === c.id)),
    })),
    students,
    invites: invites
      .filter((i) => visibleIds.has(i.classId))
      .map(({ key, classId, name, rollNo, phone, email, createdAt }) => ({ key, classId, name, rollNo, contact: phone || email, createdAt })),
    announcements: announcements
      .filter((a) => isAdmin || !a.classId || visibleIds.has(a.classId))
      .slice(0, ANNOUNCEMENTS_SHOWN)
      .map((a) => ({ ...a, canDelete: isAdmin || a.authorUid === caller.uid })),
  };

  if (isAdmin) {
    payload.college.teacherCode = college.teacherCode;
    payload.unassignedStudents = students.filter((s) => !s.classId || !visibleIds.has(s.classId)).length;
    payload.teachers = members
      .filter((m) => m.role === "teacher" || m.role === "admin")
      .map((m) => ({
        uid: m.uid, name: m.name, email: m.email || null, role: m.role,
        classes: classes.filter((c) => c.teacherUid === m.uid).map((c) => c.name),
      }));
  }
  return payload;
}

// Actions that need no existing membership.
const OPEN_ACTIONS = {
  me,
  createCollege,
  join,
  acceptInvite: (caller, body) => respondInvite(caller, body, true),
  declineInvite: (caller, body) => respondInvite(caller, body, false),
};

const MEMBER_ACTIONS = {
  dashboard, leave, createClass, updateClass, deleteClass, regenerateCode,
  addStudents, cancelInvite, updateStudent, removeMember, addTeacher, postAnnouncement, deleteAnnouncement,
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const body = req.body || {};

  try {
    const caller = await getCaller(req);
    let result;
    if (Object.hasOwn(OPEN_ACTIONS, body.action)) result = await OPEN_ACTIONS[body.action](caller, body);
    else if (Object.hasOwn(MEMBER_ACTIONS, body.action)) result = await MEMBER_ACTIONS[body.action](caller, await getMembership(caller.uid), body);
    else throw new HttpError(400, "Unknown action");
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(`college ${body.action} error:`, err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}
