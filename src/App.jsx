import { useState, useRef, useEffect } from "react";
import {
  Atom, FlaskConical, Dna, Calculator, LayoutGrid,
  ClipboardCheck, Calendar, Settings, Bell, Mic,
  Paperclip, Camera, Send, PlayCircle, Crown,
  ChevronDown, Copy, Check,
  ChevronLeft, ChevronRight, Plus, MessageSquare, Menu,
  BookMarked, Timer, CheckCircle2, XCircle, RotateCcw, FileQuestion, Target,
  Volume2, VolumeX, Loader2, Phone,
} from "lucide-react";
import { doc, getDoc, setDoc, updateDoc, increment, collection, addDoc, deleteDoc, query, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "./Login.jsx";
import { STORED_PYQ_PAPERS } from "./data/pyqPapers.js";
import AvatarWidget from "./AvatarWidget.jsx";
import VoiceCallModal from "./VoiceCallModal.jsx";

const MODELS = {
  // gemini: { id: "gemini", label: "Gemini", freeLimit: 20, period: "day", upgradable: false }, // paused — re-add to MODEL_ORDER when ready
  haiku: { id: "haiku", label: "Haiku", freeLimit: 20, period: "day", priceDisplay: "₹49/month", upgradable: true },
  sonnet: { id: "sonnet", label: "Sonnet", freeLimit: 2, period: "month", priceDisplay: "₹249/month", upgradable: true },
};
const MODEL_ORDER = ["haiku", "sonnet"];

const SUBJECTS = [
  { id: "general", label: "General", color: "#B8860B", icon: LayoutGrid },
  { id: "physics", label: "Physics", color: "#B8860B", icon: Atom },
  { id: "chemistry", label: "Chemistry", color: "#B8860B", icon: FlaskConical },
  { id: "biology", label: "Biology", color: "#B8860B", icon: Dna },
  { id: "math", label: "Mathematics", color: "#B8860B", icon: Calculator },
];

const EXAMS = ["NEET", "JEE", "KCET"];
const ACCENT = "#17140F"; // landing page's "ink"
const GREEN = "#2F6B4A"; // landing page's checkmark green

// Standard Karnataka PUC / NCERT-aligned chapter lists, used for the PYQ Bank's
// browse-by-chapter mode. Hardcoded rather than AI-generated since syllabus structure
// is stable factual data, not something worth risking a generation failure over.
// Direct links to the actual original PDF papers (unprocessed, exactly as printed),
// hosted in the ibuddie-pyq GitHub repo. Keyed as `${exam}_${year}_${setNumber}`.
const STORED_PDF_PAPERS = {
  "NEET_2026_50": "https://raw.githubusercontent.com/anilkumaruk/ibuddie-pyq/main/neet%202026%20set%2050.pdf",
  "NEET_2026_60": "https://raw.githubusercontent.com/anilkumaruk/ibuddie-pyq/main/neet%202026%20set%2060.pdf",
  "NEET_2026_70": "https://raw.githubusercontent.com/anilkumaruk/ibuddie-pyq/main/neet%202026%20set%2070.pdf",
  "NEET_2026_80": "https://raw.githubusercontent.com/anilkumaruk/ibuddie-pyq/main/neet%202026%20set%2080.pdf",
};

const PUC_SYLLABUS = {
  Physics: {
    "1st": ["Physical World and Measurement", "Kinematics", "Laws of Motion", "Work, Energy and Power", "Motion of System of Particles and Rigid Body", "Gravitation", "Mechanical Properties of Solids and Fluids", "Thermal Properties of Matter", "Thermodynamics", "Kinetic Theory", "Oscillations", "Waves"],
    "2nd": ["Electrostatics", "Current Electricity", "Magnetic Effects of Current and Magnetism", "Electromagnetic Induction and AC", "Electromagnetic Waves", "Ray Optics and Optical Instruments", "Wave Optics", "Dual Nature of Matter and Radiation", "Atoms and Nuclei", "Electronic Devices", "Communication Systems"],
  },
  Chemistry: {
    "1st": ["Some Basic Concepts of Chemistry", "Structure of Atom", "Classification of Elements and Periodicity", "Chemical Bonding and Molecular Structure", "States of Matter", "Thermodynamics", "Equilibrium", "Redox Reactions", "Hydrogen", "The s-Block Elements", "The p-Block Elements (Groups 13-14)", "Organic Chemistry — Basic Principles", "Hydrocarbons", "Environmental Chemistry"],
    "2nd": ["Solid State", "Solutions", "Electrochemistry", "Chemical Kinetics", "Surface Chemistry", "The p-Block Elements", "The d and f Block Elements", "Coordination Compounds", "Haloalkanes and Haloarenes", "Alcohols, Phenols and Ethers", "Aldehydes, Ketones and Carboxylic Acids", "Amines", "Biomolecules", "Polymers", "Chemistry in Everyday Life"],
  },
  Biology: {
    "1st": ["Diversity in Living World", "Structural Organisation in Animals and Plants", "Cell Structure and Function", "Plant Physiology", "Human Physiology"],
    "2nd": ["Reproduction", "Genetics and Evolution", "Biology and Human Welfare", "Biotechnology and Its Applications", "Ecology and Environment"],
  },
  Mathematics: {
    "1st": ["Sets", "Relations and Functions", "Trigonometric Functions", "Complex Numbers", "Linear Inequalities", "Permutations and Combinations", "Binomial Theorem", "Sequences and Series", "Straight Lines", "Conic Sections", "Introduction to 3D Geometry", "Limits and Derivatives", "Statistics", "Probability"],
    "2nd": ["Relations and Functions", "Inverse Trigonometric Functions", "Matrices", "Determinants", "Continuity and Differentiability", "Application of Derivatives", "Integrals", "Application of Integrals", "Differential Equations", "Vector Algebra", "Three Dimensional Geometry", "Linear Programming", "Probability"],
  },
};

const NAV_ITEMS = [
  { key: "doubt", label: "Doubt Desk", icon: ClipboardCheck },
  { key: "mocktest", label: "Daily Mock Test", icon: Calendar },
  { key: "topics", label: "Important Topics", icon: BookMarked },
  { key: "pyq", label: "PYQ Bank", icon: FileQuestion },
  { key: "studyplan", label: "Study Plan", icon: Target },
  { key: "settings", label: "Settings", icon: Settings },
];

function parseReply(raw) {
  const lines = raw.split("\n");
  let topic = "";
  let difficulty = "";
  let body = raw;
  const topicLine = lines.find((l) => l.trim().toUpperCase().startsWith("TOPIC:"));
  const diffLine = lines.find((l) => l.trim().toUpperCase().startsWith("DIFFICULTY:"));
  if (topicLine) topic = topicLine.split(":").slice(1).join(":").trim();
  if (diffLine) difficulty = diffLine.split(":").slice(1).join(":").trim();
  if (topicLine || diffLine) {
    body = lines.filter((l) => l !== topicLine && l !== diffLine).join("\n").trim();
  }
  return { topic, difficulty, body };
}

function timeAgo(ts) {
  const mins = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function App({ user, onLogout }) {
  const [subject, setSubject] = useState("general");
  const [exam, setExam] = useState("NEET");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window !== "undefined" ? window.innerWidth > 768 : true));
  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.innerWidth <= 768 : false));
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(() => {
    try {
      return localStorage.getItem("ibuddie_wake_word") === "true";
    } catch {
      return false;
    }
  });
  const wakeRecognitionRef = useRef(null);
  const [voiceCallOpen, setVoiceCallOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceLang, setVoiceLang] = useState("en-IN"); // "en-IN" | "kn-IN" — language for voice input
  const [speakingIndex, setSpeakingIndex] = useState(null); // index of the assistant message currently reading aloud (loading OR playing)
  const [loadingIndex, setLoadingIndex] = useState(null); // index of the message whose Sarvam audio is still being generated (before playback actually starts)
  const [attachedImage, setAttachedImage] = useState(null); // { mediaType, data, previewUrl }
  const [conversations, setConversations] = useState([]); // loaded from Firestore once the user is known — see loadConversations effect
  const [selectedModel, setSelectedModel] = useState("haiku"); // "haiku" | "sonnet" (gemini paused for now)
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null); // index of the message whose Copy button was just clicked
  const [copiedCodeKey, setCopiedCodeKey] = useState(null); // "messageIndex-segmentIndex" of the code block just copied
  const [usageCounts, setUsageCounts] = useState({ gemini: 0, haiku: 0, sonnet: 0 });
  const [subscriptions, setSubscriptions] = useState({
    haiku: { active: false, expiresAt: 0 },
    sonnet: { active: false, expiresAt: 0 },
  });
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [upgradeModel, setUpgradeModel] = useState(null); // which model triggered the paywall
  const [upgradeBusy, setUpgradeBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(null); // "haiku" | "sonnet" | null while a cancel request is in flight
  const [view, setView] = useState("doubt"); // "doubt" | "mocktest" | "topics"
  const [mockTest, setMockTest] = useState({
    status: "setup", // "setup" | "loading" | "active" | "results"
    count: 5, questions: [], currentIndex: 0, answers: {}, timeLeft: 0, score: 0,
  });
  const [topicsState, setTopicsState] = useState({ status: "setup", list: [] }); // "setup" | "loading" | "results"
  const [pyqStep, setPyqStep] = useState("browse"); // "puc" | "browse" | "chapters" | "years" | "sets" | "loading" | "results"
  const [pyqSelectionType, setPyqSelectionType] = useState(""); // "chapter" | "year"
  const [pyqSelection, setPyqSelection] = useState(""); // the chosen chapter name or year
  const [pyqSetNumber, setPyqSetNumber] = useState(""); // which NEET/JEE/KCET set code (50/60/70/80), for year-based browsing
  const [pyqBrowseMode, setPyqBrowseMode] = useState("questions"); // "questions" | "pdf" — which By Year sub-flow is active

  const [studyExamDate, setStudyExamDate] = useState(() => localStorage.getItem("ibuddie_exam_date") || "");
  const [studyPlanStep, setStudyPlanStep] = useState("setup"); // "setup" | "analysis" | "loading" | "plan"
  const [studyPlan, setStudyPlan] = useState([]); // [{ day, date, focus }]
  const [studyPlanGeneratedAt, setStudyPlanGeneratedAt] = useState(null); // timestamp — used to figure out which plan "day" is today
  const [studyPlanCompletedDays, setStudyPlanCompletedDays] = useState([]); // array of completed day numbers
  const [expandedStudyDay, setExpandedStudyDay] = useState(null); // which day card is expanded to show its task breakdown
  const [pyqList, setPyqList] = useState([]);
  const [expandedPyqIndex, setExpandedPyqIndex] = useState(null); // which question card is expanded to show its solution
  const [pucYear, setPucYear] = useState("2nd"); // "1st" | "2nd"
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const audioPlayerRef = useRef(null); // holds the currently-playing Sarvam AI audio, if any
  const ttsQueueRef = useRef(null); // { cancelled: bool } — lets us stop a chunked playback queue early
  const audioContextRef = useRef(null); // shared Web Audio context, created lazily on first Listen click
  const analyserRef = useRef(null); // AnalyserNode the avatar reads to animate its mouth to actual voice volume

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth <= 768);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // On (re)opening the app, file any leftover session from last time into Chat History,
  // then always start on a fresh chat instead of resuming where we left off.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ibuddie_messages");
      if (saved) {
        const prevMessages = JSON.parse(saved);
        if (prevMessages.length > 0) {
          const firstUserMsg = prevMessages.find((m) => m.role === "user");
          const title = firstUserMsg ? firstUserMsg.content.slice(0, 60) : "Untitled chat";
          const archived = { id: Date.now(), title, messages: prevMessages, subject: prevMessages[0]?.subject || "general", ts: Date.now() };
          setConversations((prev) => [archived, ...prev].slice(0, 30));
          if (user?.uid) {
            setDoc(doc(db, "users", user.uid, "conversations", String(archived.id)), archived).catch((e) =>
              console.error("Failed to save leftover session to Firestore:", e)
            );
          }
        }
        localStorage.removeItem("ibuddie_messages");
      }
    } catch {
      // ignore malformed/missing storage
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load (or create) this user's per-model usage + subscriptions from Firestore.
  // Gemini/Haiku reset daily; Sonnet resets monthly — each model checks its own clock.
  useEffect(() => {
    if (!user?.uid) return;
    const todayStr = new Date().toDateString();
    const monthStr = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    const defaultCounts = { gemini: 0, haiku: 0, sonnet: 0 };
    const defaultSubs = { haiku: { active: false, expiresAt: 0 }, sonnet: { active: false, expiresAt: 0 } };

    async function loadUsage() {
      const ref = doc(db, "users", user.uid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        await setDoc(ref, { counts: defaultCounts, lastResetDate: todayStr, lastResetMonth: monthStr, subscriptions: defaultSubs });
        setUsageCounts(defaultCounts);
        setSubscriptions(defaultSubs);
        return;
      }

      const data = snap.data();
      let subs = { ...defaultSubs, ...(data.subscriptions || {}) };

      // Drop any subscription (haiku, sonnet — independent of each other) that's expired
      let subsChanged = false;
      for (const key of ["haiku", "sonnet"]) {
        if (subs[key]?.active && subs[key]?.expiresAt && Date.now() > subs[key].expiresAt) {
          subs[key] = { active: false, expiresAt: 0 };
          subsChanged = true;
        }
      }
      if (subsChanged) {
        await setDoc(ref, { subscriptions: subs }, { merge: true });
      }

      // Reset each model's counter on its own clock — daily models on a new day,
      // monthly models (Sonnet) on a new calendar month.
      const needsDayReset = data.lastResetDate !== todayStr;
      const needsMonthReset = data.lastResetMonth !== monthStr;
      let counts = { ...defaultCounts, ...(data.counts || {}) };
      const update = {};
      for (const key of MODEL_ORDER) {
        const isMonthly = MODELS[key].period === "month";
        if (isMonthly ? needsMonthReset : needsDayReset) counts[key] = 0;
      }
      if (needsDayReset || needsMonthReset) update.counts = counts;
      if (needsDayReset) update.lastResetDate = todayStr;
      if (needsMonthReset) update.lastResetMonth = monthStr;
      if (Object.keys(update).length > 0) {
        await setDoc(ref, update, { merge: true });
      }

      setUsageCounts(counts);
      setSubscriptions(subs);
    }

    loadUsage().catch((e) => console.error("Failed to load usage:", e));
  }, [user?.uid]);

  // One-time recovery: if this browser has old, pre-migration conversation history sitting
  // in localStorage that was never carried over to Firestore, import it now so it isn't
  // lost — then load the (now-complete) conversation list from Firestore. Sequenced in one
  // effect so the load always happens after any recovery finishes, never racing it.
  useEffect(() => {
    if (!user?.uid) return;
    async function migrateThenLoadConversations() {
      const alreadyMigrated = localStorage.getItem("ibuddie_conversations_migrated");
      if (!alreadyMigrated) {
        try {
          const saved = localStorage.getItem("ibuddie_conversations");
          const oldConversations = saved ? JSON.parse(saved) : [];
          if (oldConversations.length > 0) {
            await Promise.all(
              oldConversations.map((c) =>
                setDoc(doc(db, "users", user.uid, "conversations", String(c.id)), c).catch((e) =>
                  console.error("Failed to migrate a conversation:", e)
                )
              )
            );
            console.log(`Recovered ${oldConversations.length} pre-migration conversation(s) into Firestore.`);
          }
          localStorage.setItem("ibuddie_conversations_migrated", "true");
        } catch (e) {
          console.error("Local history recovery failed:", e);
        }
      }

      try {
        const q = query(collection(db, "users", user.uid, "conversations"), orderBy("ts", "desc"), limit(30));
        const snap = await getDocs(q);
        setConversations(snap.docs.map((d) => d.data()));
      } catch (e) {
        console.error("Failed to load conversations from Firestore:", e);
      }
    }
    migrateThenLoadConversations();
  }, [user?.uid]);

  // Loads any previously-generated study plan so it survives navigation/refresh — no
  // need to re-spend a generation call just from leaving the tab and coming back.
  useEffect(() => {
    if (!user?.uid) return;
    async function loadStudyPlan() {
      try {
        const snap = await getDoc(doc(db, "users", user.uid, "studyPlan", "current"));
        if (snap.exists()) {
          const data = snap.data();
          setStudyPlan(data.plan || []);
          setStudyPlanGeneratedAt(data.generatedAt || null);
          setStudyPlanCompletedDays(data.completedDays || []);
          if (data.examDate) setStudyExamDate(data.examDate);
          if (data.plan && data.plan.length > 0) setStudyPlanStep("plan");
        }
      } catch (e) {
        console.error("Failed to load study plan from Firestore:", e);
      }
    }
    loadStudyPlan();
  }, [user?.uid]);


  useEffect(() => {
    try {
      localStorage.setItem("ibuddie_messages", JSON.stringify(messages));
    } catch {
      // storage full or unavailable — ignore
    }
  }, [messages]);

  function startNewChat() {
    if (messages.length > 0) {
      const firstUserMsg = messages.find((m) => m.role === "user");
      const title = firstUserMsg ? firstUserMsg.content.slice(0, 60) : "Untitled chat";
      const newConversation = { id: Date.now(), title, messages, subject, ts: Date.now() };
      setConversations((prev) => [newConversation, ...prev].slice(0, 30));
      if (user?.uid) {
        setDoc(doc(db, "users", user.uid, "conversations", String(newConversation.id)), newConversation).catch((e) =>
          console.error("Failed to save conversation to Firestore:", e)
        );
      }
    }
    setMessages([]);
    setAttachedImage(null);
    setInput("");
  }

  function openConversation(conv) {
    if (messages.length > 0) {
      const firstUserMsg = messages.find((m) => m.role === "user");
      const title = firstUserMsg ? firstUserMsg.content.slice(0, 60) : "Untitled chat";
      const current = { id: Date.now(), title, messages, subject, ts: Date.now() };
      setConversations((prev) => [current, ...prev.filter((c) => c.id !== conv.id)].slice(0, 30));
      if (user?.uid) {
        setDoc(doc(db, "users", user.uid, "conversations", String(current.id)), current).catch((e) =>
          console.error("Failed to save conversation to Firestore:", e)
        );
        deleteDoc(doc(db, "users", user.uid, "conversations", String(conv.id))).catch((e) =>
          console.error("Failed to remove reopened conversation from Firestore:", e)
        );
      }
    } else {
      setConversations((prev) => prev.filter((c) => c.id !== conv.id));
      if (user?.uid) {
        deleteDoc(doc(db, "users", user.uid, "conversations", String(conv.id))).catch((e) =>
          console.error("Failed to remove reopened conversation from Firestore:", e)
        );
      }
    }
    setMessages(conv.messages);
    setSubject(conv.subject || "general");
  }

  const currentSubject = SUBJECTS.find((s) => s.id === subject);

  function parseMessageSegments(text) {
    if (!text) return [];
    const segments = [];
    const fenceRegex = /```(\w*)\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;
    while ((match = fenceRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: "text", content: text.slice(lastIndex, match.index) });
      }
      segments.push({ type: "code", language: match[1] || "text", content: match[2].replace(/\n$/, "") });
      lastIndex = fenceRegex.lastIndex;
    }
    if (lastIndex < text.length) {
      segments.push({ type: "text", content: text.slice(lastIndex) });
    }
    return segments;
  }

  function copyToClipboard(text, index) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex((cur) => (cur === index ? null : cur)), 1800);
    }).catch((e) => console.error("Copy failed:", e));
  }

  function copyCodeBlock(text, key) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedCodeKey(key);
      setTimeout(() => setCopiedCodeKey((cur) => (cur === key ? null : cur)), 1800);
    }).catch((e) => console.error("Copy failed:", e));
  }

  // Ticks the mock test countdown once a second while active; auto-submits
  // (scoring whatever's answered so far) the moment it reaches zero.
  useEffect(() => {
    if (mockTest.status !== "active") return;
    if (mockTest.timeLeft <= 0) {
      finishMockTest();
      return;
    }
    const t = setTimeout(() => {
      setMockTest((prev) => (prev.status === "active" ? { ...prev, timeLeft: prev.timeLeft - 1 } : prev));
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mockTest.status, mockTest.timeLeft]);

  // Paywall check only — does NOT consume usage. Call this before the fetch;
  // call consumeUsage() separately, only after a request actually succeeds,
  // so a failed generation doesn't cost the student a free doubt.
  function canUseModel() {
    const modelConfig = MODELS[selectedModel];
    const hasActiveSub = modelConfig.upgradable && subscriptions[selectedModel]?.active;
    const outOfFreeChats = !hasActiveSub && usageCounts[selectedModel] >= modelConfig.freeLimit;
    if (outOfFreeChats) {
      setUpgradeModel(selectedModel);
      setUpgradeOpen(true);
      return false;
    }
    return true;
  }

  function consumeUsage() {
    const modelConfig = MODELS[selectedModel];
    const hasActiveSub = modelConfig.upgradable && subscriptions[selectedModel]?.active;
    if (!hasActiveSub && user?.uid) {
      setUsageCounts((prev) => ({ ...prev, [selectedModel]: prev[selectedModel] + 1 }));
      updateDoc(doc(db, "users", user.uid), { [`counts.${selectedModel}`]: increment(1) }).catch((e) =>
        console.error("Failed to update usage count:", e)
      );
    }
  }

  async function startMockTest() {
    if (subject === "general") return;
    if (!canUseModel()) return;

    setMockTest((prev) => ({ ...prev, status: "loading" }));
    try {
      const res = await fetch("/api/mock-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: currentSubject.label, exam, count: mockTest.count, model: selectedModel }),
      });
      const data = await res.json();
      if (!res.ok || !data.questions) throw new Error(data.error || `Server error (${res.status})`);

      consumeUsage();
      setMockTest({
        status: "active",
        count: data.questions.length,
        questions: data.questions,
        currentIndex: 0,
        answers: {},
        timeLeft: data.questions.length * 45, // 45 seconds per question
        score: 0,
      });
    } catch (e) {
      console.error(e);
      alert(`Couldn't generate the mock test: ${e.message}`);
      setMockTest((prev) => ({ ...prev, status: "setup" }));
    }
  }

  function selectMockAnswer(qIndex, optionIndex) {
    setMockTest((prev) => ({ ...prev, answers: { ...prev.answers, [qIndex]: optionIndex } }));
  }

  function finishMockTest() {
    setMockTest((prev) => {
      let score = 0;
      prev.questions.forEach((q, i) => {
        if (prev.answers[i] === q.correctIndex) score++;
      });
      return { ...prev, status: "results", score };
    });
  }

  function resetMockTest() {
    setMockTest({ status: "setup", count: 5, questions: [], currentIndex: 0, answers: {}, timeLeft: 0, score: 0 });
  }

  async function generateTopics() {
    if (subject === "general") return;
    if (!canUseModel()) return;

    setTopicsState({ status: "loading", list: [] });
    try {
      const res = await fetch("/api/important-topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: currentSubject.label, exam, puc: pucYear, model: selectedModel }),
      });
      const data = await res.json();
      if (!res.ok || !data.chapters) throw new Error(data.error || `Server error (${res.status})`);

      consumeUsage();
      setTopicsState({ status: "results", list: data.chapters });
    } catch (e) {
      console.error(e);
      alert(`Couldn't load important topics: ${e.message}`);
      setTopicsState({ status: "setup", list: [] });
    }
  }

  async function generatePyq(selectionType, selection) {
    if (subject === "general") return;

    setPyqSelectionType(selectionType);
    setPyqSelection(selection);
    setExpandedPyqIndex(null);

    // Year-based browsing = real stored papers only, never AI-generated.
    // NEET/JEE/KCET each release multiple sets per year, so ask which set next.
    if (selectionType === "year") {
      setPyqSetNumber("");
      setPyqStep("sets");
      return;
    }

    if (!canUseModel()) return;
    setPyqStep("loading");
    try {
      const res = await fetch("/api/pyq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: currentSubject.label,
          exam,
          puc: pucYear,
          model: selectedModel,
          chapter: selectionType === "chapter" ? selection : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.questions) throw new Error(data.error || `Server error (${res.status})`);

      consumeUsage();
      setPyqList(data.questions);
      setPyqStep("results");
    } catch (e) {
      console.error(e);
      alert(`Couldn't load practice questions: ${e.message}`);
      setPyqStep("browse");
    }
  }

  function selectPyqSet(setNumber) {
    setPyqSetNumber(setNumber);
    setExpandedPyqIndex(null);

    if (pyqBrowseMode === "pdf") {
      const pdfKey = `${exam}_${pyqSelection}_${setNumber}`;
      const pdfUrl = STORED_PDF_PAPERS[pdfKey];
      if (pdfUrl) {
        window.open(pdfUrl, "_blank", "noopener,noreferrer");
        setPyqStep("sets"); // stay on the set picker so they can open another one easily
        return;
      }
      setPyqStep("unavailable");
      return;
    }

    const key = `${exam}_${pyqSelection}_${currentSubject.label}_${setNumber}`;
    const stored = STORED_PYQ_PAPERS[key];
    if (stored && stored.length > 0) {
      setPyqList(stored);
      setPyqStep("results");
      return;
    }
    setPyqStep("unavailable");
  }

  // Aggregates real topic/subject data already tagged on every Doubt Desk answer — no
  // new tracking needed. More times a topic comes up = treated as a weaker area.
  function analyzeWeakTopics() {
    const allMessages = [...conversations.flatMap((c) => c.messages || []), ...messages];
    const countsBySubject = {}; // { Physics: { "Kinematics": 3, ... }, ... }
    for (const m of allMessages) {
      if (m.role !== "assistant" || !m.topic || !m.subject || m.subject === "general") continue;
      const subjLabel = SUBJECTS.find((s) => s.id === m.subject)?.label || m.subject;
      if (!countsBySubject[subjLabel]) countsBySubject[subjLabel] = {};
      countsBySubject[subjLabel][m.topic] = (countsBySubject[subjLabel][m.topic] || 0) + 1;
    }
    const result = {};
    for (const subj of Object.keys(countsBySubject)) {
      result[subj] = Object.entries(countsBySubject[subj])
        .map(([topic, count]) => ({ topic, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5); // top 5 weakest per subject is plenty to act on
    }
    return result;
  }

  async function generateStudyPlan() {
    const weakTopics = analyzeWeakTopics();
    if (Object.keys(weakTopics).length === 0) return;
    if (!canUseModel()) return;

    setStudyPlanStep("loading");
    try {
      const today = new Date();
      const target = new Date(studyExamDate);
      const daysRemaining = Math.max(1, Math.ceil((target - today) / (1000 * 60 * 60 * 24)));

      const res = await fetch("/api/study-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weakTopics, exam, daysRemaining, model: selectedModel }),
      });
      const data = await res.json();
      if (!res.ok || !data.plan) throw new Error(data.error || `Server error (${res.status})`);

      consumeUsage();
      const generatedAt = Date.now();
      setStudyPlan(data.plan);
      setStudyPlanGeneratedAt(generatedAt);
      setStudyPlanCompletedDays([]);
      setStudyPlanStep("plan");
      if (user?.uid) {
        setDoc(doc(db, "users", user.uid, "studyPlan", "current"), {
          plan: data.plan,
          examDate: studyExamDate,
          generatedAt,
          completedDays: [],
        }).catch((e) => console.error("Failed to save study plan to Firestore:", e));
      }
    } catch (e) {
      console.error(e);
      alert(`Couldn't build your study plan: ${e.message}`);
      setStudyPlanStep("analysis");
    }
  }

  function toggleStudyDayComplete(dayNumber) {
    setStudyPlanCompletedDays((prev) => {
      const updated = prev.includes(dayNumber) ? prev.filter((d) => d !== dayNumber) : [...prev, dayNumber];
      if (user?.uid) {
        updateDoc(doc(db, "users", user.uid, "studyPlan", "current"), { completedDays: updated }).catch((e) =>
          console.error("Failed to sync completed day:", e)
        );
      }
      return updated;
    });
  }

  function formatTimer(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  async function sendMessage() {
    const question = input.trim();
    if ((!question && !attachedImage) || loading) return;

    const modelConfig = MODELS[selectedModel];
    const hasActiveSub = modelConfig.upgradable && subscriptions[selectedModel]?.active;
    const outOfFreeChats = !hasActiveSub && usageCounts[selectedModel] >= modelConfig.freeLimit;
    const periodLabel = modelConfig.period === "month" ? "this month" : "today";

    if (outOfFreeChats) {
      if (modelConfig.upgradable) {
        setUpgradeModel(selectedModel);
        setUpgradeOpen(true);
      } else {
        alert(`You've used all ${modelConfig.freeLimit} free ${modelConfig.label} doubts for ${periodLabel}. Try again later, or switch models.`);
      }
      return;
    }

    setInput("");
    const imageForSend = attachedImage;
    setAttachedImage(null);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: question || "(sent an image)", imagePreview: imageForSend?.previewUrl, subject, exam, model: selectedModel, ts: Date.now() },
    ]);
    setLoading(true);

    if (!hasActiveSub && user?.uid) {
      setUsageCounts((prev) => ({ ...prev, [selectedModel]: prev[selectedModel] + 1 }));
      updateDoc(doc(db, "users", user.uid), { [`counts.${selectedModel}`]: increment(1) }).catch((e) =>
        console.error("Failed to update usage count:", e)
      );
    }

    const isGeneral = subject === "general";
    const conciseInstruction = "Keep the explanation focused and concise — 150-250 words unless the question genuinely needs a longer worked example or derivation.";
    const codeInstruction = "If the answer includes code, wrap ONLY the code in a fenced block using triple backticks with the language name right after the opening backticks, e.g. ```python\\ncode here\\n```. Never use any other markdown symbols like ** or # anywhere.";
    const toneInstruction = "Speak like a warm, encouraging friend and guide — patient and human, never robotic or overly formal. It's fine to sound like a supportive senior/tutor, not a textbook. If the student's question is written or spoken in Kannada, reply in natural Kannada, mixing in English technical terms the way students actually speak (Kanglish) — otherwise reply in English.";
    const systemPrompt = isGeneral
      ? `You are iBuddie's AI Mentor in General mode — a clear, well-researched assistant anyone can use for any question, not limited to exam prep.
Answer accurately and helpfully, structured with short paragraphs or numbered steps where useful. ${codeInstruction} ${conciseInstruction} ${toneInstruction}
Format your response EXACTLY as:
TOPIC: <short topic name for what this question is about>
DIFFICULTY: <Basic, Intermediate, or Advanced>
<then a blank line, then your full answer.>`
      : `You are iBuddie's AI Mentor, an expert ${currentSubject.label} tutor for Indian Class 11-12 students preparing for ${exam}. 
Answer the student's doubt clearly and step by step, matched to the ${exam} syllabus and difficulty level. ${codeInstruction} ${conciseInstruction} ${toneInstruction}
Format your response EXACTLY as:
TOPIC: <short topic name, e.g. "Optics — Refraction at Curved Surfaces">
DIFFICULTY: <Easy, Medium, or Hard for ${exam}>
<then a blank line, then your full explanation in plain text with clear steps. Use short paragraphs or numbered steps.>`;

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question || "Please look at this image and help explain it.",
          systemPrompt,
          image: imageForSend ? { mediaType: imageForSend.mediaType, data: imageForSend.data } : undefined,
          model: selectedModel,
        }),
      });
      if (!response.ok || !response.body) throw new Error("Stream failed");

      setMessages((prev) => [...prev, { role: "assistant", topic: "", difficulty: "", body: "", subject }]);
      setLoading(false);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        const parsed = parseReply(fullText);
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: "assistant", ...parsed, subject };
          return updated;
        });
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", topic: "", difficulty: "", body: "Couldn't reach the AI Mentor. Please try again.", subject }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function handleFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(",")[1];
      setAttachedImage({ mediaType: file.type, data: base64, previewUrl: dataUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  useEffect(() => {
    try {
      localStorage.setItem("ibuddie_wake_word", wakeWordEnabled ? "true" : "false");
    } catch {}
  }, [wakeWordEnabled]);

  // Background "Hey Darling" listener — only runs while enabled, and pauses whenever the
  // regular mic or the voice call itself is already using the microphone, to avoid conflicts.
  useEffect(() => {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!wakeWordEnabled || !SpeechRecognitionCtor || recording || voiceCallOpen) {
      wakeRecognitionRef.current?.stop();
      return;
    }

    let stopped = false;

    function startWakeListener() {
      if (stopped) return;
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = voiceLang;
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript.toLowerCase();
          if (transcript.includes("hey darling") || transcript.includes("hey, darling")) {
            const isProUser = MODEL_ORDER.some((key) => subscriptions[key]?.active);
            if (isProUser) setVoiceCallOpen(true);
            else {
              setUpgradeModel(selectedModel);
              setUpgradeOpen(true);
            }
            return;
          }
        }
      };
      recognition.onerror = (event) => {
        if (stopped) return;
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          setWakeWordEnabled(false); // mic permission denied — turn the feature back off cleanly
        }
        // other errors (e.g. "no-speech", which is expected often during ambient listening) — onend handles restart
      };
      recognition.onend = () => {
        if (!stopped) {
          try {
            recognition.start();
          } catch {}
        }
      };

      wakeRecognitionRef.current = recognition;
      try {
        recognition.start();
      } catch {}
    }

    startWakeListener();

    return () => {
      stopped = true;
      try {
        wakeRecognitionRef.current?.stop();
      } catch {}
    };
  }, [wakeWordEnabled, recording, voiceCallOpen, voiceLang, subscriptions, selectedModel]);

  function toggleVoiceInput() {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      alert("Voice input isn't supported in this browser. Try Chrome.");
      return;
    }
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = voiceLang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput((prev) => (prev ? prev + " " + transcript : transcript));
    };
    recognition.onerror = () => setRecording(false);
    recognition.onend = () => setRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  }

  function speakWithBrowserVoice(text, index) {
    setLoadingIndex(null); // browser voice starts near-instantly, no loading phase to show
    if (!window.speechSynthesis) {
      alert("Voice output isn't supported in this browser. Try Chrome.");
      setSpeakingIndex(null);
      return;
    }
    const isKannada = /[\u0C80-\u0CFF]/.test(text);
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = isKannada ? "kn-IN" : "en-IN";
    utterance.rate = 0.95;
    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);
    window.speechSynthesis.speak(utterance);
  }

  // Splits a reply into small sentence-based chunks (Kannada danda "।" included) so we
  // can fetch several short Sarvam TTS clips in parallel instead of one long blocking one.
  function splitIntoSpeechChunks(text, maxChunkLen = 220, maxChunks = 6) {
    const sentences = text.split(/(?<=[.!?।])\s+/).filter(Boolean);
    const chunks = [];
    let current = "";
    for (const sentence of sentences) {
      const candidate = current ? `${current} ${sentence}` : sentence;
      if (candidate.length > maxChunkLen && current) {
        chunks.push(current.trim());
        current = sentence;
      } else {
        current = candidate;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    if (chunks.length === 0) return [text];
    // Cap the number of parallel requests — merge any overflow into the final chunk
    let result = chunks;
    if (chunks.length > maxChunks) {
      const head = chunks.slice(0, maxChunks - 1);
      const tail = chunks.slice(maxChunks - 1).join(" ");
      result = [...head, tail];
    }
    return shortenOpeningChunk(result, 70);
  }

  // Splits an oversized first chunk at the nearest word boundary so the very first
  // burst of audio is tiny (~70 chars) — this is what actually drops time-to-first-sound,
  // since synthesis + transfer time scales with how much text is in that first request.
  function shortenOpeningChunk(chunks, openingMaxLen) {
    if (chunks.length === 0 || chunks[0].length <= openingMaxLen) return chunks;
    const first = chunks[0];
    let cutIndex = first.lastIndexOf(" ", openingMaxLen);
    if (cutIndex <= 0) cutIndex = openingMaxLen; // no space found — hard cut as a fallback
    const opening = first.slice(0, cutIndex).trim();
    const rest = first.slice(cutIndex).trim();
    const result = [...chunks];
    result.splice(0, 1, opening, rest);
    return result;
  }

  async function fetchSpeechChunk(chunkText, languageCode) {
    const res = await fetch("/api/text-to-speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: chunkText, languageCode }),
    });
    if (!res.ok) throw new Error("Sarvam TTS chunk request failed");
    return res.blob();
  }

  function ensureAnalyser() {
    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      audioContextRef.current = new AudioCtx();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.connect(audioContextRef.current.destination);
    }
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume().catch(() => {});
    }
  }

  async function playSarvamChunks(text, isKannada) {
    const languageCode = isKannada ? "kn-IN" : "en-IN";
    const chunks = splitIntoSpeechChunks(text);
    const queueState = { cancelled: false };
    ttsQueueRef.current = queueState;
    ensureAnalyser(); // set up (or resume) the audio graph the avatar's mouth animation reads from

    // Kick off every chunk's request at once — the first (short) chunk comes back fast,
    // and later chunks are already generating in the background by the time we reach them.
    const chunkPromises = chunks.map((chunk) => fetchSpeechChunk(chunk, languageCode));

    for (let i = 0; i < chunkPromises.length; i++) {
      if (queueState.cancelled) return;
      const blob = await chunkPromises[i];
      if (queueState.cancelled) return;
      const url = URL.createObjectURL(blob);
      await new Promise((resolve, reject) => {
        const player = new Audio(url);
        audioPlayerRef.current = player;
        try {
          const source = audioContextRef.current.createMediaElementSource(player);
          source.connect(analyserRef.current);
        } catch (e) {
          console.error("Could not connect audio analyser (avatar mouth won't be reactive for this clip):", e);
        }
        player.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        player.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Playback error"));
        };
        player
          .play()
          .then(() => setLoadingIndex(null)) // first sound is actually playing now — swap loading spinner for the "Stop" state
          .catch(reject);
      });
    }
  }

  async function speakMessage(text, index) {
    // Toggle off if this exact message is already speaking (whether still loading or already playing)
    if (speakingIndex === index) {
      window.speechSynthesis?.cancel();
      audioPlayerRef.current?.pause();
      if (ttsQueueRef.current) ttsQueueRef.current.cancelled = true;
      setSpeakingIndex(null);
      setLoadingIndex(null);
      return;
    }
    // Stop whatever else was reading (browser voice or a Sarvam clip)
    window.speechSynthesis?.cancel();
    audioPlayerRef.current?.pause();
    if (ttsQueueRef.current) ttsQueueRef.current.cancelled = true;

    const isKannada = /[\u0C80-\u0CFF]/.test(text);
    const isProUser = MODEL_ORDER.some((key) => subscriptions[key]?.active);
    setSpeakingIndex(index);

    // Pro users get the natural Sarvam AI voice; free users (and any Sarvam failure) fall back to the free browser voice
    if (isProUser) {
      setLoadingIndex(index); // show a spinner while the first chunk generates
      try {
        await playSarvamChunks(text, isKannada);
        setSpeakingIndex(null);
        setLoadingIndex(null);
        return;
      } catch (e) {
        console.error("Sarvam TTS failed, falling back to browser voice:", e);
        // fall through to browser voice below (which clears loadingIndex itself)
      }
    }

    speakWithBrowserVoice(text, index);
  }

  function loadRazorpayScript() {
    return new Promise((resolve) => {
      if (window.Razorpay) return resolve(true);
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  }

  async function handleUpgrade() {
    const tier = upgradeModel; // "haiku" | "sonnet"
    if (!tier) return;
    const modelConfig = MODELS[tier];
    setUpgradeBusy(true);
    try {
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        alert("Couldn't load payment gateway. Check your connection and try again.");
        setUpgradeBusy(false);
        return;
      }

      const subRes = await fetch("/api/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, uid: user.uid }),
      });
      const subOrder = await subRes.json();
      if (!subRes.ok) throw new Error(subOrder.error || "Could not create subscription");

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        subscription_id: subOrder.subscriptionId,
        name: `iBuddie ${modelConfig.label} Pro`,
        description: `Auto-renewing ${modelConfig.label} access — ${modelConfig.priceDisplay}`,
        handler: async function (response) {
          try {
            const verifyRes = await fetch("/api/verify-subscription", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_subscription_id: response.razorpay_subscription_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const result = await verifyRes.json();
            if (verifyRes.ok && result.success) {
              // Optimistic ~30-day window for instant UI feedback — the webhook
              // corrects this to the real billing-cycle date moments later, and
              // is the source of truth for every renewal after this first one.
              const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
              const newSubs = {
                ...subscriptions,
                [tier]: { active: true, expiresAt, subscriptionId: response.razorpay_subscription_id, status: "activated" },
              };
              await updateDoc(doc(db, "users", user.uid), { [`subscriptions.${tier}`]: newSubs[tier] });
              setSubscriptions(newSubs);
              setUpgradeOpen(false);
              alert(`You're now on ${modelConfig.label} Pro! It'll auto-renew at ${modelConfig.priceDisplay} until you cancel.`);
            } else {
              alert("Payment verification failed. If money was deducted, contact support.");
            }
          } catch (e) {
            console.error(e);
            alert("Something went wrong verifying your payment. Contact support if you were charged.");
          } finally {
            setUpgradeBusy(false);
          }
        },
        modal: {
          ondismiss: () => setUpgradeBusy(false),
        },
        prefill: { name: user?.name || "" },
        theme: { color: ACCENT },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (e) {
      console.error(e);
      alert("Couldn't start checkout. Please try again.");
      setUpgradeBusy(false);
    }
  }

  async function handleCancelSubscription(tier) {
    const subscriptionId = subscriptions[tier]?.subscriptionId;
    if (!subscriptionId) return;
    if (!window.confirm(`Stop auto-renewal for ${MODELS[tier].label} Pro? You'll keep access until the current billing period ends.`)) return;

    setCancelBusy(tier);
    try {
      const res = await fetch("/api/cancel-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        alert(`Auto-renewal turned off for ${MODELS[tier].label} Pro. You'll keep access until it expires, then drop to the free tier.`);
      } else {
        alert("Couldn't cancel right now. Please try again.");
      }
    } catch (e) {
      console.error(e);
      alert("Couldn't cancel right now. Please try again.");
    } finally {
      setCancelBusy(null);
    }
  }

  return (
    <div style={{ height: "100vh", width: "100%", display: "flex", background: "#F2EFE7", backgroundImage: "linear-gradient(#DAD4C5 1px, transparent 1px), linear-gradient(90deg, #DAD4C5 1px, transparent 1px)", backgroundSize: "32px 32px", fontFamily: "'Inter', system-ui, sans-serif", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        ::placeholder { color: #8C7D6B; }
        textarea:focus { outline: none; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
          .ibuddie-main { padding: 12px !important; }
          .ibuddie-subjects { flex-wrap: nowrap !important; overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
          .ibuddie-subjects > div { flex-shrink: 0; }
          .ibuddie-chat-card { padding: 14px !important; }
          .ibuddie-input-icons { gap: 10px !important; }
          .ibuddie-empty-headline { font-size: 13px !important; }
          .ibuddie-user-bubble { font-size: 13px !important; padding: 10px 14px !important; }
          .ibuddie-ai-bubble { font-size: 13px !important; padding: 12px 14px !important; line-height: 1.6 !important; }
          .ibuddie-tag { font-size: 9px !important; padding: 2px 7px !important; }
          .ibuddie-input-textarea { font-size: 13px !important; }
        }
      `}</style>

      {/* Mobile sidebar backdrop */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 30 }}
        />
      )}

      {/* Sidebar */}
      <div
        style={{
          width: sidebarOpen ? 236 : 72, background: "#F2EFE7", display: "flex", flexDirection: "column",
          padding: sidebarOpen ? "22px 16px" : "22px 10px", flexShrink: 0, transition: "width 0.18s ease",
          position: isMobile ? "fixed" : "relative", top: 0, left: 0, height: isMobile ? "100vh" : "auto",
          zIndex: isMobile ? 35 : 1, transform: isMobile && !sidebarOpen ? "translateX(-100%)" : "translateX(0)",
          overflowY: "auto",
        }}
      >
        <div
          onClick={() => setSidebarOpen((v) => !v)}
          style={{
            position: "absolute", top: 24, right: -12, width: 24, height: 24, borderRadius: "50%",
            background: ACCENT, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.25)", zIndex: 2,
          }}
        >
          {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 6px", marginBottom: 26, justifyContent: sidebarOpen ? "flex-start" : "center" }}>
          {sidebarOpen ? (
            <span style={{ fontSize: 22, fontWeight: 800, color: "#17140F" }}>i<span style={{ color: "#B8860B" }}>Buddie</span></span>
          ) : (
            <span style={{ fontSize: 20, fontWeight: 800, color: "#17140F" }}>i</span>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {NAV_ITEMS.map((item) => (
            <div
              key={item.key}
              title={item.label}
              onClick={() => {
                if (item.key === "settings") setSettingsOpen(true);
                else {
                  if (item.key === "pyq") { setPyqStep("browse"); setPyqSetNumber(""); setPyqBrowseMode("questions"); }
                  setView(item.key);
                  if (isMobile) setSidebarOpen(false);
                }
              }}
              style={{
                display: "flex", alignItems: "center", gap: 11,
                padding: sidebarOpen ? "10px 12px" : "10px 0",
                justifyContent: sidebarOpen ? "flex-start" : "center",
                borderRadius: 10,
                background: view === item.key ? ACCENT : "transparent",
                color: view === item.key ? "#FFFFFF" : "#8C7D6B",
                fontSize: 13.5, fontWeight: 500, cursor: "pointer",
              }}
            >
              <item.icon size={17} />
              {sidebarOpen && item.label}
            </div>
          ))}
        </div>

        {/* New Chat */}
        <div
          onClick={() => { startNewChat(); setView("doubt"); if (isMobile) setSidebarOpen(false); }}
          title="New Chat"
          style={{
            display: "flex", alignItems: "center", gap: 11,
            padding: sidebarOpen ? "10px 12px" : "10px 0",
            justifyContent: sidebarOpen ? "flex-start" : "center",
            borderRadius: 10, marginTop: 10,
            border: "1px solid #DAD4C5",
            color: "#17140F",
            fontSize: 13.5, fontWeight: 600, cursor: "pointer",
          }}
        >
          <Plus size={17} />
          {sidebarOpen && "New Chat"}
        </div>

        {/* Chat History */}
        {sidebarOpen && (
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid #DAD4C5", minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ fontWeight: 700, fontSize: 12.5, color: "#8C7D6B", marginBottom: 12, letterSpacing: "0.03em", textTransform: "uppercase" }}>Chat History</div>
            {conversations.length === 0 && <div style={{ fontSize: 11.5, color: "#8C7D6B" }}>Past chats will show up here once you start a new one.</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 280, overflowY: "auto" }}>
              {conversations.map((conv) => {
                const s = SUBJECTS.find((sub) => sub.id === conv.subject);
                return (
                  <div
                    key={conv.id}
                    onClick={() => { openConversation(conv); setView("doubt"); if (isMobile) setSidebarOpen(false); }}
                    style={{ display: "flex", gap: 9, padding: "6px 4px", borderRadius: 8, cursor: "pointer" }}
                  >
                    <div style={{ width: 26, height: 26, borderRadius: 7, background: "rgba(23,20,15,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {s ? <s.icon size={12} color="#17140F" /> : <MessageSquare size={12} color="#17140F" />}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 500, color: "#17140F", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{conv.title}</div>
                      <div style={{ fontSize: 10, color: "#8C7D6B" }}>{s?.label || "General"} · {timeAgo(conv.ts)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ flex: 1 }} />
        {sidebarOpen && (() => {
          const m = MODELS[selectedModel];
          const isSubbed = m.upgradable && subscriptions[selectedModel]?.active;
          const periodLabel = m.period === "month" ? "this month" : "today";
          if (isSubbed) {
            return (
              <div style={{ background: "linear-gradient(160deg, #1A1A1A, #3A3A3A)", borderRadius: 16, padding: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Crown size={16} color="#FFFFFF" />
                  <span style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 13.5 }}>{m.label} Pro active</span>
                </div>
                <div style={{ color: "#EDEDE9", fontSize: 11.5, marginTop: 6 }}>Auto-renews monthly. Unlimited {m.label} doubts until then.</div>
                <div
                  onClick={() => cancelBusy !== selectedModel && handleCancelSubscription(selectedModel)}
                  style={{ color: "#B0AAA0", fontSize: 11, marginTop: 10, cursor: cancelBusy === selectedModel ? "default" : "pointer", textDecoration: "underline" }}
                >
                  {cancelBusy === selectedModel ? "Cancelling…" : "Cancel auto-renewal"}
                </div>
              </div>
            );
          }
          if (!m.upgradable) {
            return (
              <div style={{ background: "linear-gradient(160deg, #1A1A1A, #3A3A3A)", borderRadius: 16, padding: 16 }}>
                <div style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>{m.label}</div>
                <div style={{ color: "#EDEDE9", fontSize: 11.5 }}>{usageCounts[selectedModel]}/{m.freeLimit} free doubts used {periodLabel}</div>
              </div>
            );
          }
          return (
            <div style={{ background: "linear-gradient(160deg, #1A1A1A, #3A3A3A)", borderRadius: 16, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                <Crown size={16} color="#FFFFFF" />
                <span style={{ color: "#FFFFFF", fontWeight: 700, fontSize: 13.5 }}>{m.label} Pro</span>
              </div>
              <div style={{ color: "#EDEDE9", fontSize: 11.5, marginBottom: 8 }}>{usageCounts[selectedModel]}/{m.freeLimit} free {m.label} doubts used {periodLabel}</div>
              {["Unlimited doubts", "Priority support"].map((f) => (
                <div key={f} style={{ color: "#EDEDE9", fontSize: 12, marginBottom: 5 }}>✓ {f}</div>
              ))}
              <div
                onClick={() => { setUpgradeModel(selectedModel); setUpgradeOpen(true); }}
                style={{ background: "#FFFFFF", color: "#1A1A1A", textAlign: "center", borderRadius: 9, padding: "8px 0", fontWeight: 700, fontSize: 12.5, marginTop: 10, cursor: "pointer" }}
              >
                Upgrade Now →
              </div>
            </div>
          );
        })()}
      </div>

      {/* Main */}
      <div className="ibuddie-main" style={{ flex: 1, display: "flex", padding: "22px 10px", gap: 20, minWidth: 0, height: "100vh", overflow: "hidden" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
          {/* Top bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isMobile ? 10 : 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {isMobile && (
                <Menu size={12} color="#2B2018" style={{ cursor: "pointer" }} onClick={() => setSidebarOpen(true)} />
              )}
              <span style={{ fontSize: isMobile ? 7 : 12, fontWeight: 600, color: "#8C7D6B", letterSpacing: "0.04em" }}>
                AI MENTOR · {view === "doubt" ? "DOUBT DESK" : view === "mocktest" ? "DAILY MOCK TEST" : view === "pyq" ? "PYQ BANK" : view === "studyplan" ? "STUDY PLAN" : "IMPORTANT TOPICS"}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 14, position: "relative" }}>
              <Bell size={isMobile ? 10 : 17} color="#8C7D6B" />
              <div
                onClick={() => setProfileOpen((v) => !v)}
                style={{ display: "flex", alignItems: "center", gap: isMobile ? 5 : 8, background: "#FFFFFF", padding: isMobile ? "3px 6px 3px 3px" : "5px 10px 5px 5px", borderRadius: 999, boxShadow: "0 1px 4px rgba(20,15,5,0.25)", cursor: "pointer" }}
              >
                <div style={{ width: isMobile ? 16 : 26, height: isMobile ? 16 : 26, borderRadius: "50%", background: ACCENT, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: isMobile ? 7 : 12, fontWeight: 700, flexShrink: 0 }}>
                  {(user?.name || "A")[0].toUpperCase()}
                </div>
                <span style={{ fontSize: isMobile ? 8 : 13, fontWeight: 600, color: "#2B2018", whiteSpace: "nowrap" }}>Hi, {user?.name || "there"}</span>
                <ChevronDown size={isMobile ? 8 : 14} color="#8C7D6B" />
              </div>
              {profileOpen && (
                <div style={{ position: "absolute", top: 44, right: 0, background: "#FFFFFF", borderRadius: 12, boxShadow: "0 8px 24px rgba(20,15,5,0.18)", padding: 6, minWidth: 160, zIndex: 10 }}>
                  <div style={{ padding: "8px 12px", fontSize: 12, color: "#8C7D6B", borderBottom: "1px solid #E4E2DA", marginBottom: 4 }}>
                    {user?.name || "Account"}
                  </div>
                  <div
                    onClick={() => { setProfileOpen(false); setSettingsOpen(true); }}
                    style={{ padding: "8px 12px", fontSize: 13, fontWeight: 500, color: "#2B2018", borderRadius: 8, cursor: "pointer" }}
                  >
                    Settings
                  </div>
                  <div
                    onClick={() => { setProfileOpen(false); onLogout && onLogout(); }}
                    style={{ padding: "8px 12px", fontSize: 13, fontWeight: 500, color: "#B23B3B", borderRadius: 8, cursor: "pointer" }}
                  >
                    Logout
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Subject cards + exam pills */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: isMobile ? 10 : 8, flexWrap: "wrap", gap: 12 }}>
            <div className="ibuddie-subjects" style={{ display: "flex", gap: isMobile ? 6 : 6 }}>
              {SUBJECTS.map((s) => (
                <div
                  key={s.id}
                  onClick={() => { setSubject(s.id); setPyqStep("browse"); setPyqSetNumber(""); setPyqBrowseMode("questions"); }}
                  style={{
                    width: isMobile ? 50 : 56, padding: isMobile ? "7px 5px" : "8px 5px", borderRadius: isMobile ? 9 : 10, textAlign: "center", cursor: "pointer",
                    background: subject === s.id ? `${s.color}14` : "#FFFFFF",
                    border: subject === s.id ? `1.5px solid ${s.color}` : "1.5px solid #E4E2DA",
                  }}
                >
                  <s.icon size={isMobile ? 12 : 14} color={s.color} style={{ marginBottom: isMobile ? 3 : 4 }} />
                  <div style={{ fontSize: isMobile ? 7 : 8.5, fontWeight: 600, color: subject === s.id ? s.color : "#8C7D6B" }}>{s.label}</div>
                </div>
              ))}
            </div>
            {subject !== "general" && (
              <div style={{ display: "flex", gap: 4, background: "#FFFFFF", border: "1px solid #E4E2DA", borderRadius: 10, padding: 3 }}>
                {EXAMS.map((ex) => (
                  <div
                    key={ex}
                    onClick={() => setExam(ex)}
                    style={{
                      padding: "7px 16px", borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                      background: exam === ex ? "#FFFFFF" : "transparent",
                      color: exam === ex ? ACCENT : "#8C7D6B",
                      border: exam === ex ? `1px solid ${ACCENT}` : "1px solid transparent",
                    }}
                  >
                    {ex}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chat card */}
          {view === "doubt" && (
          <div className="ibuddie-chat-card" style={{ flex: 1, background: "#FFFFFF", borderRadius: 18, border: "1px solid #E4E2DA", padding: 24, display: "flex", flexDirection: "column", minHeight: 0, justifyContent: messages.length === 0 ? "center" : undefined }}>
            {messages.length > 0 && (
              <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 20, minHeight: 0 }}>
                {messages.map((m, i) =>
                  m.role === "user" ? (
                    <div key={i} style={{ alignSelf: "flex-end", maxWidth: "82%" }}>
                      <div className="ibuddie-user-bubble" style={{ background: ACCENT, color: "#fff", padding: "14px 18px", borderRadius: "16px 16px 4px 16px", fontSize: 15.5, lineHeight: 1.6, textAlign: "left" }}>
                        {m.imagePreview && (
                          <img src={m.imagePreview} alt="attached" style={{ width: "100%", maxWidth: 220, borderRadius: 10, marginBottom: 8, display: "block" }} />
                        )}
                        {m.content}
                      </div>
                    </div>
                  ) : (
                    <div key={i} style={{ alignSelf: "flex-start", maxWidth: "92%" }}>
                      {m.topic && (
                        <div style={{ display: "flex", gap: 6, marginBottom: 7, flexWrap: "wrap" }}>
                          <span className="ibuddie-tag" style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: `${SUBJECTS.find((s) => s.id === m.subject)?.color || ACCENT}14`, color: SUBJECTS.find((s) => s.id === m.subject)?.color || ACCENT }}>
                            {m.topic}
                          </span>
                          {m.difficulty && (
                            <span className="ibuddie-tag" style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: "#F2F2F0", color: "#1A1A1A" }}>
                              {m.difficulty}
                            </span>
                          )}
                        </div>
                      )}
                      {parseMessageSegments(m.body).map((seg, si) =>
                        seg.type === "code" ? (
                          <div key={si} style={{ background: "#1E1E1E", borderRadius: 12, overflow: "hidden", marginBottom: 4 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", background: "#2A2A2A" }}>
                              <span style={{ fontSize: 12, color: "#B5B0A8", fontFamily: "monospace" }}>{seg.language}</span>
                              <div
                                onClick={() => copyCodeBlock(seg.content, `${i}-${si}`)}
                                style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", color: "#B5B0A8", fontSize: 11.5 }}
                              >
                                {copiedCodeKey === `${i}-${si}` ? (
                                  <>
                                    <Check size={13} />
                                    <span>Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy size={13} />
                                    <span>Copy code</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <pre style={{ margin: 0, padding: "14px 16px", overflowX: "auto", fontSize: 13.5, lineHeight: 1.6, color: "#E8E6E1", fontFamily: "'SF Mono', Consolas, monospace", textAlign: "left" }}>
                              <code>{seg.content}</code>
                            </pre>
                          </div>
                        ) : (
                          seg.content.trim() && (
                            <div key={si} className="ibuddie-ai-bubble" style={{ background: "#F2F2F0", padding: "16px 18px", borderRadius: "4px 16px 16px 16px", fontSize: 15.5, lineHeight: 1.75, color: "#2B2018", whiteSpace: "pre-wrap", marginBottom: 4, textAlign: "left" }}>
                              {seg.content.trim()}
                            </div>
                          )
                        )
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <div
                          onClick={() => copyToClipboard(m.body, i)}
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 6, padding: "4px 6px", borderRadius: 6, cursor: "pointer", color: "#8C7D6B", fontSize: 11.5 }}
                        >
                          {copiedIndex === i ? (
                            <>
                              <Check size={13} />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy size={13} />
                              <span>Copy</span>
                            </>
                          )}
                        </div>
                        <div
                          onClick={() => speakMessage(m.body, i)}
                          title={loadingIndex === i ? "Generating voice…" : speakingIndex === i ? "Stop" : "Listen to this reply"}
                          style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 6, padding: "4px 6px", borderRadius: 6, cursor: "pointer", color: speakingIndex === i ? "#2F6B4A" : "#8C7D6B", fontSize: 11.5 }}
                        >
                          {loadingIndex === i ? (
                            <>
                              <Loader2 size={13} style={{ animation: "spin 0.8s linear infinite" }} />
                              <span>Loading…</span>
                            </>
                          ) : speakingIndex === i ? (
                            <>
                              <VolumeX size={13} style={{ animation: "pulse 1.2s ease-in-out infinite" }} />
                              <span>Stop</span>
                            </>
                          ) : (
                            <>
                              <Volume2 size={13} />
                              <span>Listen</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                )}
                {loading && <div style={{ alignSelf: "flex-start", fontSize: 12.5, color: "#8C7D6B" }}>thinking…</div>}
              </div>
            )}

            {messages.length === 0 && (
              <div style={{ textAlign: "center", color: "#8C7D6B", marginBottom: 22 }}>
                <div className="ibuddie-empty-headline" style={{ fontSize: 14.5 }}>
                  {subject === "general" ? "Ask me anything to get started." : `Ask any ${currentSubject.label.toLowerCase()} doubt to get started.`}
                </div>
              </div>
            )}

            {/* Input row */}
            <div style={{ marginTop: messages.length === 0 ? 0 : 16, border: "1px solid #E4E2DA", borderRadius: 16, padding: "10px 12px", background: "#FFFFFF" }}>
              {attachedImage && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#F2F2F0", borderRadius: 10, padding: "6px 8px", marginBottom: 8 }}>
                  <img src={attachedImage.previewUrl} alt="attached" style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover" }} />
                  <span style={{ fontSize: 12, color: "#8C7D6B" }}>Image attached</span>
                  <span onClick={() => setAttachedImage(null)} style={{ cursor: "pointer", fontSize: 13, color: "#B23B3B", padding: "0 6px" }}>✕</span>
                </div>
              )}
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={subject === "general" ? "Type any question…" : `Type your ${currentSubject.label.toLowerCase()} doubt here…`}
                rows={3}
                spellCheck={false}
                className="ibuddie-input-textarea"
                style={{ width: "100%", border: "none", outline: "none", resize: "none", fontFamily: "'Inter', sans-serif", fontSize: 14, color: "#2B2018", background: "#FFFFFF" }}
              />
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelected} style={{ display: "none" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                <div className="ibuddie-input-icons" style={{ display: "flex", alignItems: "center", gap: 14, color: "#8C7D6B" }}>
                  <Paperclip size={17} style={{ cursor: "pointer" }} onClick={() => fileInputRef.current?.click()} />
                  <Camera size={17} style={{ cursor: "pointer" }} onClick={() => fileInputRef.current?.click()} />

                  {/* Model picker — dropdown inline in the ask box */}
                  <div style={{ position: "relative" }}>
                    <div
                      onClick={() => setModelMenuOpen((v) => !v)}
                      style={{
                        display: "flex", alignItems: "center", gap: 4, cursor: "pointer",
                        padding: "5px 10px", borderRadius: 999, border: "1px solid #E4E2DA",
                        background: "#F9F9F7",
                      }}
                    >
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: "#2B2018" }}>{MODELS[selectedModel].label}</span>
                      <ChevronDown size={13} color="#8C7D6B" style={{ transform: modelMenuOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                    </div>

                    {modelMenuOpen && (
                      <>
                        <div onClick={() => setModelMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 39 }} />
                        <div
                          style={{
                            position: "absolute", bottom: "calc(100% + 8px)", left: 0, zIndex: 40,
                            background: "#FFFFFF", border: "1px solid #E4E2DA", borderRadius: 12,
                            boxShadow: "0 8px 24px rgba(20,15,10,0.12)", padding: 6, width: 200,
                          }}
                        >
                          {MODEL_ORDER.map((key) => {
                            const m = MODELS[key];
                            const isActive = selectedModel === key;
                            const hasSub = m.upgradable && subscriptions[key]?.active;
                            const remaining = hasSub ? null : Math.max(0, m.freeLimit - usageCounts[key]);
                            const periodLabel = m.period === "month" ? "left this month" : "left today";
                            return (
                              <div
                                key={key}
                                onClick={() => { setSelectedModel(key); setModelMenuOpen(false); }}
                                style={{
                                  display: "flex", flexDirection: "column", gap: 1,
                                  padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                                  background: isActive ? "#F2F2F0" : "transparent",
                                }}
                              >
                                <span style={{ fontSize: 13, fontWeight: 700, color: "#2B2018" }}>{m.label}</span>
                                <span style={{ fontSize: 10.5, color: "#8C7D6B" }}>
                                  {hasSub ? "Unlimited" : `${remaining}/${m.freeLimit} ${periodLabel}`}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div
                    onClick={() => setVoiceLang((prev) => (prev === "en-IN" ? "kn-IN" : "en-IN"))}
                    title="Voice input language"
                    style={{
                      fontSize: 10.5, fontWeight: 700, color: "#8C7D6B", cursor: "pointer",
                      border: "1px solid #E4E2DA", borderRadius: 999, padding: "3px 8px", userSelect: "none",
                    }}
                  >
                    {voiceLang === "en-IN" ? "EN" : "ಕನ್ನಡ"}
                  </div>
                  <Mic
                    size={18}
                    color={recording ? "#B23B3B" : "#8C7D6B"}
                    style={{ cursor: "pointer", animation: recording ? "pulse 1s infinite" : "none" }}
                    onClick={toggleVoiceInput}
                    title={`Voice input (${voiceLang === "en-IN" ? "English" : "Kannada"})`}
                  />
                  <Phone
                    size={18}
                    color="#8C7D6B"
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      const isProUser = MODEL_ORDER.some((key) => subscriptions[key]?.active);
                      if (isProUser) setVoiceCallOpen(true);
                      else {
                        setUpgradeModel(selectedModel);
                        setUpgradeOpen(true);
                      }
                    }}
                    title="Talk live with iBuddie"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={loading || (!input.trim() && !attachedImage)}
                    style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "9px 20px", borderRadius: 12, border: "none",
                      background: loading || (!input.trim() && !attachedImage) ? "#E4E2DA" : ACCENT,
                      color: loading || (!input.trim() && !attachedImage) ? "#8C7D6B" : "#fff",
                      fontWeight: 600, fontSize: 13.5, cursor: loading || (!input.trim() && !attachedImage) ? "default" : "pointer",
                    }}
                  >
                    <Send size={14} /> Ask
                  </button>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* Mock Test card */}
          {view === "mocktest" && (
            <div className="ibuddie-chat-card" style={{ flex: 1, background: "#FFFFFF", borderRadius: 18, border: "1px solid #E4E2DA", padding: 28, display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto" }}>
              {subject === "general" ? (
                <div style={{ margin: "auto", textAlign: "center", color: "#8C7D6B", maxWidth: 320 }}>
                  <Calendar size={28} color="#B8860B" style={{ marginBottom: 12 }} />
                  <div style={{ fontSize: 14.5 }}>Pick a subject (Physics, Chemistry, Biology, or Mathematics) from above to start a mock test.</div>
                </div>
              ) : mockTest.status === "setup" ? (
                <div style={{ margin: "auto", textAlign: "center", maxWidth: 360 }}>
                  <Calendar size={28} color="#B8860B" style={{ marginBottom: 14 }} />
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#2B2018", marginBottom: 6 }}>{currentSubject.label} Mock Test</div>
                  <div style={{ fontSize: 13, color: "#8C7D6B", marginBottom: 22 }}>{exam} level · timed · auto-scored</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "#8C7D6B", marginBottom: 10 }}>Number of questions</div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 26 }}>
                    {[5, 10, 15].map((n) => (
                      <div
                        key={n}
                        onClick={() => setMockTest((prev) => ({ ...prev, count: n }))}
                        style={{
                          padding: "9px 18px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 700,
                          border: mockTest.count === n ? "1.5px solid #B8860B" : "1.5px solid #E4E2DA",
                          background: mockTest.count === n ? "#B8860B14" : "#FFFFFF",
                          color: mockTest.count === n ? "#8F6A08" : "#2B2018",
                        }}
                      >
                        {n}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={startMockTest}
                    style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, fontSize: 14.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                  >
                    <PlayCircle size={17} /> Start Test
                  </button>
                </div>
              ) : mockTest.status === "loading" ? (
                <div style={{ margin: "auto", textAlign: "center", color: "#8C7D6B", fontSize: 13.5 }}>Building your {currentSubject.label} test…</div>
              ) : mockTest.status === "active" ? (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: "#8C7D6B" }}>Question {mockTest.currentIndex + 1} of {mockTest.questions.length}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: mockTest.timeLeft < 30 ? "#B23B3B" : "#2B2018" }}>
                      <Timer size={15} /> {formatTimer(mockTest.timeLeft)}
                    </div>
                  </div>
                  <div style={{ height: 4, background: "#F2F2F0", borderRadius: 999, marginBottom: 26, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${((mockTest.currentIndex + 1) / mockTest.questions.length) * 100}%`, background: "#B8860B", transition: "width 0.2s ease" }} />
                  </div>
                  <div style={{ fontSize: 16.5, fontWeight: 600, color: "#2B2018", marginBottom: 22, lineHeight: 1.5 }}>
                    {mockTest.questions[mockTest.currentIndex].question}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
                    {mockTest.questions[mockTest.currentIndex].options.map((opt, oi) => {
                      const isSelected = mockTest.answers[mockTest.currentIndex] === oi;
                      return (
                        <div
                          key={oi}
                          onClick={() => selectMockAnswer(mockTest.currentIndex, oi)}
                          style={{
                            padding: "13px 16px", borderRadius: 12, cursor: "pointer", fontSize: 14.5,
                            border: isSelected ? "1.5px solid #17140F" : "1.5px solid #E4E2DA",
                            background: isSelected ? "#F2F2F0" : "#FFFFFF",
                            color: "#2B2018",
                          }}
                        >
                          {opt}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <button
                      onClick={() => setMockTest((prev) => ({ ...prev, currentIndex: Math.max(0, prev.currentIndex - 1) }))}
                      disabled={mockTest.currentIndex === 0}
                      style={{ padding: "10px 18px", borderRadius: 10, border: "1px solid #E4E2DA", background: "#FFFFFF", color: mockTest.currentIndex === 0 ? "#C7C2B6" : "#2B2018", fontWeight: 600, fontSize: 13.5, cursor: mockTest.currentIndex === 0 ? "default" : "pointer" }}
                    >
                      Previous
                    </button>
                    {mockTest.currentIndex < mockTest.questions.length - 1 ? (
                      <button
                        onClick={() => setMockTest((prev) => ({ ...prev, currentIndex: prev.currentIndex + 1 }))}
                        style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}
                      >
                        Next
                      </button>
                    ) : (
                      <button
                        onClick={finishMockTest}
                        style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}
                      >
                        Submit
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ textAlign: "center", marginBottom: 26 }}>
                    <div style={{ fontSize: 13, color: "#8C7D6B", marginBottom: 4 }}>Your score</div>
                    <div style={{ fontSize: 36, fontWeight: 800, color: "#2B2018" }}>{mockTest.score} / {mockTest.questions.length}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
                    {mockTest.questions.map((q, qi) => {
                      const userAnswer = mockTest.answers[qi];
                      const isCorrect = userAnswer === q.correctIndex;
                      return (
                        <div key={qi} style={{ background: "#F2F2F0", borderRadius: 12, padding: 16 }}>
                          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                            {isCorrect ? <CheckCircle2 size={16} color={GREEN} style={{ flexShrink: 0, marginTop: 2 }} /> : <XCircle size={16} color="#B23B3B" style={{ flexShrink: 0, marginTop: 2 }} />}
                            <div style={{ fontSize: 14, fontWeight: 600, color: "#2B2018" }}>{q.question}</div>
                          </div>
                          <div style={{ fontSize: 12.5, color: "#8C7D6B", marginBottom: 4 }}>
                            Correct answer: <span style={{ color: GREEN, fontWeight: 600 }}>{q.options[q.correctIndex]}</span>
                            {!isCorrect && userAnswer !== undefined && <> · Your answer: <span style={{ color: "#B23B3B", fontWeight: 600 }}>{q.options[userAnswer]}</span></>}
                          </div>
                          <div style={{ fontSize: 12.5, color: "#8C7D6B", lineHeight: 1.5 }}>{q.explanation}</div>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={resetMockTest}
                    style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "1px solid #E4E2DA", background: "#FFFFFF", color: "#2B2018", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                  >
                    <RotateCcw size={15} /> Try Another Test
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Important Topics card */}
          {view === "topics" && (
            <div className="ibuddie-chat-card" style={{ flex: 1, background: "#FFFFFF", borderRadius: 18, border: "1px solid #E4E2DA", padding: 28, display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto" }}>
              {subject === "general" ? (
                <div style={{ margin: "auto", textAlign: "center", color: "#8C7D6B", maxWidth: 320 }}>
                  <BookMarked size={28} color="#B8860B" style={{ marginBottom: 12 }} />
                  <div style={{ fontSize: 14.5 }}>Pick a subject (Physics, Chemistry, Biology, or Mathematics) from above to see its important topics.</div>
                </div>
              ) : topicsState.status === "setup" ? (
                <div style={{ margin: "auto", textAlign: "center", maxWidth: 340 }}>
                  <BookMarked size={28} color="#B8860B" style={{ marginBottom: 14 }} />
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#2B2018", marginBottom: 6 }}>{currentSubject.label} — Important Topics</div>
                  <div style={{ fontSize: 13, color: "#8C7D6B", marginBottom: 18 }}>High-yield topics for {exam}, by chapter, with what to focus on and practice questions.</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#8C7D6B", marginBottom: 8 }}>PUC Year</div>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 24 }}>
                    {[{ id: "1st", label: "1st PUC" }, { id: "2nd", label: "2nd PUC" }].map((p) => (
                      <div
                        key={p.id}
                        onClick={() => setPucYear(p.id)}
                        style={{
                          padding: "9px 18px", borderRadius: 10, cursor: "pointer", fontSize: 13.5, fontWeight: 700,
                          border: pucYear === p.id ? "1.5px solid #B8860B" : "1.5px solid #E4E2DA",
                          background: pucYear === p.id ? "#B8860B14" : "#FFFFFF",
                          color: pucYear === p.id ? "#8F6A08" : "#2B2018",
                        }}
                      >
                        {p.label}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={generateTopics}
                    style={{ padding: "13px 26px", borderRadius: 12, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, fontSize: 14.5, cursor: "pointer" }}
                  >
                    Show Important Topics
                  </button>
                </div>
              ) : topicsState.status === "loading" ? (
                <div style={{ margin: "auto", textAlign: "center", color: "#8C7D6B", fontSize: 13.5 }}>Finding the highest-yield {currentSubject.label} topics…</div>
              ) : (
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#2B2018", marginBottom: 4 }}>{currentSubject.label} — Important Topics</div>
                  <div style={{ fontSize: 12.5, color: "#8C7D6B", marginBottom: 20 }}>{pucYear} PUC · {exam} level · by chapter, highest weightage first</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
                    {topicsState.list.map((ch, ci) => (
                      <div key={ci} style={{ border: "1px solid #E4E2DA", borderRadius: 14, overflow: "hidden" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "#F2F2F0" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 22, height: 22, borderRadius: 6, background: "#B8860B22", color: "#8F6A08", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{ci + 1}</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: "#2B2018" }}>{ch.chapter}</div>
                          </div>
                          {ch.weightage && (
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: "#8F6A08", background: "#B8860B14", padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap" }}>{ch.weightage}</div>
                          )}
                        </div>
                        <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                          {(ch.topics || []).map((t, ti) => (
                            <div key={ti} style={{ paddingLeft: 12, borderLeft: "2px solid #E4E2DA" }}>
                              <div style={{ fontSize: 13.5, fontWeight: 700, color: "#2B2018", marginBottom: 3 }}>{t.topic}</div>
                              <div style={{ fontSize: 12, color: "#8C7D6B", lineHeight: 1.5, marginBottom: 2 }}><strong style={{ color: "#2B2018" }}>Why it matters: </strong>{t.why}</div>
                              <div style={{ fontSize: 12, color: "#8C7D6B", lineHeight: 1.5, marginBottom: t.sampleQuestions?.length ? 8 : 0 }}><strong style={{ color: "#2B2018" }}>Focus on: </strong>{t.focus}</div>
                              {t.sampleQuestions?.length > 0 && (
                                <div style={{ background: "#F9F9F7", border: "1px solid #E4E2DA", borderRadius: 8, padding: 10 }}>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: "#8C7D6B", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>Practice questions in this style</div>
                                  {t.sampleQuestions.map((sq, si) => (
                                    <div key={si} style={{ fontSize: 12, color: "#2B2018", lineHeight: 1.5, marginBottom: si < t.sampleQuestions.length - 1 ? 5 : 0 }}>{si + 1}. {sq}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setTopicsState({ status: "setup", list: [] })}
                    style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "1px solid #E4E2DA", background: "#FFFFFF", color: "#2B2018", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                  >
                    <RotateCcw size={15} /> Regenerate
                  </button>
                </div>
              )}
            </div>
          )}

          {view === "pyq" && (
            <div className="ibuddie-chat-card" style={{ flex: 1, background: "#FFFFFF", borderRadius: 18, border: "1px solid #E4E2DA", padding: 28, display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto" }}>
              {subject === "general" ? (
                <div style={{ margin: "auto", textAlign: "center", color: "#8C7D6B", maxWidth: 320 }}>
                  <FileQuestion size={28} color="#B8860B" style={{ marginBottom: 12 }} />
                  <div style={{ fontSize: 14.5 }}>Pick a subject (Physics, Chemistry, Biology, or Mathematics) from above to see practice questions.</div>
                </div>
              ) : pyqStep === "browse" ? (
                <div style={{ margin: "auto", textAlign: "center", maxWidth: 380 }}>
                  <FileQuestion size={28} color="#B8860B" style={{ marginBottom: 14 }} />
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#2B2018", marginBottom: 6 }}>{currentSubject.label} — PYQ Bank</div>
                  <div style={{ fontSize: 13, color: "#8C7D6B", marginBottom: 22 }}>How do you want to browse?</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div
                      onClick={() => setPyqStep("puc")}
                      style={{ padding: "18px 20px", borderRadius: 14, border: "1.5px solid #E4E2DA", cursor: "pointer", textAlign: "left" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#2B2018" }}>By Chapter</div>
                        <span style={{ fontSize: 9.5, fontWeight: 800, color: "#8F6A08", background: "#B8860B1A", padding: "2px 8px", borderRadius: 999, letterSpacing: "0.02em" }}>AI GENERATED</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: "#8C7D6B" }}>Pick your class and a specific chapter to practice</div>
                    </div>
                    <div
                      onClick={() => { setPyqBrowseMode("questions"); setPyqStep("years"); }}
                      style={{ padding: "18px 20px", borderRadius: 14, border: "1.5px solid #E4E2DA", cursor: "pointer", textAlign: "left" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#2B2018" }}>By Year</div>
                        <span style={{ fontSize: 9.5, fontWeight: 800, color: "#215038", background: "#2F6B4A1A", padding: "2px 8px", borderRadius: 999, letterSpacing: "0.02em" }}>REAL PAPERS</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: "#8C7D6B" }}>Real questions from a specific exam year and set (covers the full syllabus, not split by class)</div>
                    </div>
                    <div
                      onClick={() => { setPyqBrowseMode("pdf"); setPyqStep("years"); }}
                      style={{ padding: "18px 20px", borderRadius: 14, border: "1.5px solid #E4E2DA", cursor: "pointer", textAlign: "left" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#2B2018" }}>View Original PDF</div>
                        <span style={{ fontSize: 9.5, fontWeight: 800, color: "#1A4D6E", background: "#2B7FB01A", padding: "2px 8px", borderRadius: 999, letterSpacing: "0.02em" }}>EXACT PAPER</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: "#8C7D6B" }}>See the unprocessed paper exactly as printed, for a specific year and set</div>
                    </div>
                  </div>
                </div>
              ) : pyqStep === "puc" ? (
                <div style={{ margin: "auto", textAlign: "center", maxWidth: 360 }}>
                  <FileQuestion size={28} color="#B8860B" style={{ marginBottom: 14 }} />
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#2B2018", marginBottom: 6 }}>{currentSubject.label} — By Chapter</div>
                  <div style={{ fontSize: 13, color: "#8C7D6B", marginBottom: 22 }}>Which class are you in?</div>
                  <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                    {[{ id: "1st", label: "1st PUC" }, { id: "2nd", label: "2nd PUC" }].map((p) => (
                      <div
                        key={p.id}
                        onClick={() => { setPucYear(p.id); setPyqStep("chapters"); }}
                        style={{
                          padding: "14px 28px", borderRadius: 12, cursor: "pointer", fontSize: 14.5, fontWeight: 700,
                          border: "1.5px solid #E4E2DA", background: "#FFFFFF", color: "#2B2018",
                        }}
                      >
                        {p.label}
                      </div>
                    ))}
                  </div>
                  <div onClick={() => setPyqStep("browse")} style={{ marginTop: 20, fontSize: 12.5, color: "#8C7D6B", cursor: "pointer", textDecoration: "underline" }}>
                    ← Back
                  </div>
                </div>
              ) : pyqStep === "chapters" ? (
                <div style={{ maxWidth: 480, margin: "0 auto", width: "100%" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#8C7D6B", marginBottom: 8, textAlign: "center" }}>{pucYear} PUC · {currentSubject.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#2B2018", marginBottom: 20, textAlign: "center" }}>Choose a chapter</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {(PUC_SYLLABUS[currentSubject.label]?.[pucYear] || []).map((chapter) => (
                      <div
                        key={chapter}
                        onClick={() => generatePyq("chapter", chapter)}
                        style={{ padding: "13px 16px", borderRadius: 10, border: "1px solid #E4E2DA", cursor: "pointer", fontSize: 13.5, color: "#2B2018", display: "flex", alignItems: "center", justifyContent: "space-between" }}
                      >
                        {chapter}
                        <ChevronDown size={14} color="#8C7D6B" style={{ transform: "rotate(-90deg)" }} />
                      </div>
                    ))}
                  </div>
                  <div onClick={() => setPyqStep("puc")} style={{ marginTop: 18, fontSize: 12.5, color: "#8C7D6B", cursor: "pointer", textDecoration: "underline", textAlign: "center" }}>
                    ← Back
                  </div>
                </div>
              ) : pyqStep === "years" ? (
                <div style={{ margin: "auto", textAlign: "center", maxWidth: 380 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#8C7D6B", marginBottom: 8 }}>{currentSubject.label} · {exam}{pyqBrowseMode === "pdf" ? " · Original PDF" : ""}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#2B2018", marginBottom: 6 }}>Choose a year</div>
                  <div style={{ fontSize: 11.5, color: "#8C7D6B", marginBottom: 20, fontStyle: "italic" }}>{pyqBrowseMode === "pdf" ? "Opens the real, unprocessed paper in a new tab." : "Real questions from that year's actual paper, where available."}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
                    {[2026, 2025, 2024, 2023, 2022].map((yr) => (
                      <div
                        key={yr}
                        onClick={() => generatePyq("year", String(yr))}
                        style={{ padding: "13px 22px", borderRadius: 12, border: "1.5px solid #E4E2DA", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#2B2018" }}
                      >
                        {yr}
                      </div>
                    ))}
                  </div>
                  <div onClick={() => setPyqStep("browse")} style={{ marginTop: 20, fontSize: 12.5, color: "#8C7D6B", cursor: "pointer", textDecoration: "underline" }}>
                    ← Back
                  </div>
                </div>
              ) : pyqStep === "sets" ? (
                <div style={{ margin: "auto", textAlign: "center", maxWidth: 380 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#8C7D6B", marginBottom: 8 }}>{currentSubject.label} · {exam} {pyqSelection}{pyqBrowseMode === "pdf" ? " · Original PDF" : ""}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#2B2018", marginBottom: 6 }}>Choose a set</div>
                  <div style={{ fontSize: 11.5, color: "#8C7D6B", marginBottom: 20, fontStyle: "italic" }}>{pyqBrowseMode === "pdf" ? "Opens that booklet's PDF in a new tab." : "Each year is released as multiple question booklets — pick the set code."}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
                    {["50", "60", "70", "80"].map((setNum) => (
                      <div
                        key={setNum}
                        onClick={() => selectPyqSet(setNum)}
                        style={{ padding: "13px 22px", borderRadius: 12, border: "1.5px solid #E4E2DA", cursor: "pointer", fontSize: 14, fontWeight: 700, color: "#2B2018" }}
                      >
                        Set {setNum}
                      </div>
                    ))}
                  </div>
                  <div onClick={() => setPyqStep("years")} style={{ marginTop: 20, fontSize: 12.5, color: "#8C7D6B", cursor: "pointer", textDecoration: "underline" }}>
                    ← Back
                  </div>
                </div>
              ) : pyqStep === "unavailable" ? (
                <div style={{ margin: "auto", textAlign: "center", maxWidth: 360 }}>
                  <FileQuestion size={28} color="#B8860B" style={{ marginBottom: 14 }} />
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#2B2018", marginBottom: 6 }}>{exam} {pyqSelection}{pyqSetNumber ? ` Set ${pyqSetNumber}` : ""} not added yet</div>
                  <div style={{ fontSize: 13, color: "#8C7D6B", marginBottom: 22 }}>{pyqBrowseMode === "pdf" ? "We haven't uploaded the original PDF for this one yet." : `We haven't stored a real ${currentSubject.label} paper for this one yet.`} Try another set or year, or browse by chapter instead.</div>
                  <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                    <button
                      onClick={() => setPyqStep("sets")}
                      style={{ padding: "11px 20px", borderRadius: 10, border: "1px solid #E4E2DA", background: "#FFFFFF", color: "#2B2018", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}
                    >
                      ← Try Another Set
                    </button>
                    <button
                      onClick={() => setPyqStep("years")}
                      style={{ padding: "11px 20px", borderRadius: 10, border: "1px solid #E4E2DA", background: "#FFFFFF", color: "#2B2018", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}
                    >
                      ← Try Another Year
                    </button>
                    <button
                      onClick={() => setPyqStep("puc")}
                      style={{ padding: "11px 20px", borderRadius: 10, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}
                    >
                      Browse by Chapter
                    </button>
                  </div>
                </div>
              ) : pyqStep === "loading" ? (
                <div style={{ margin: "auto", textAlign: "center", color: "#8C7D6B", fontSize: 13.5 }}>Building {currentSubject.label} practice questions…</div>
              ) : (
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#2B2018", marginBottom: 4 }}>{currentSubject.label} — {pyqSelectionType === "chapter" ? pyqSelection : `${exam} ${pyqSelection}${pyqSetNumber ? ` (Set ${pyqSetNumber})` : ""}`}</div>
                  <div style={{ fontSize: 12.5, color: "#8C7D6B", marginBottom: 20 }}>{pyqSelectionType === "chapter" ? `${pucYear} PUC · ` : ""}{exam} level · tap a question to reveal the answer and full solution</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                    {pyqList.map((q, qi) => {
                      const isOpen = expandedPyqIndex === qi;
                      return (
                        <div key={qi} style={{ border: "1px solid #E4E2DA", borderRadius: 14, overflow: "hidden" }}>
                          <div
                            onClick={() => setExpandedPyqIndex(isOpen ? null : qi)}
                            style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "14px 16px", background: "#F2F2F0", cursor: "pointer" }}
                          >
                            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                              <div style={{ width: 22, height: 22, borderRadius: 6, background: "#B8860B22", color: "#8F6A08", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>{qi + 1}</div>
                              <div>
                                <div style={{ fontSize: 13.5, fontWeight: 700, color: "#2B2018", lineHeight: 1.5 }}>{q.question}</div>
                                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: "#8F6A08", background: "#B8860B14", padding: "2px 8px", borderRadius: 999 }}>{q.topic}</span>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: "#8C7D6B", background: "#F9F9F7", border: "1px solid #E4E2DA", padding: "2px 8px", borderRadius: 999 }}>{q.difficulty}</span>
                                </div>
                              </div>
                            </div>
                            <ChevronDown size={16} color="#8C7D6B" style={{ flexShrink: 0, marginTop: 3, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }} />
                          </div>
                          {isOpen && (
                            <div style={{ padding: 16 }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                                {(q.options || []).map((opt, oi) => (
                                  <div
                                    key={oi}
                                    style={{
                                      display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, fontSize: 13,
                                      border: oi === q.correctIndex ? "1.5px solid #2F6B4A" : "1px solid #E4E2DA",
                                      background: oi === q.correctIndex ? "#2F6B4A14" : "#FFFFFF",
                                      color: oi === q.correctIndex ? "#215038" : "#2B2018",
                                      fontWeight: oi === q.correctIndex ? 700 : 400,
                                    }}
                                  >
                                    {oi === q.correctIndex ? <CheckCircle2 size={15} color="#2F6B4A" style={{ flexShrink: 0 }} /> : <div style={{ width: 15, flexShrink: 0 }} />}
                                    {opt}
                                  </div>
                                ))}
                              </div>
                              {q.correctIndex === null && (
                                <div style={{ background: "#FFF4E5", border: "1px solid #E8C468", borderRadius: 10, padding: "8px 12px", marginBottom: 10, fontSize: 11.5, color: "#8F6A08", fontWeight: 700 }}>
                                  ⚠ Answer not confidently resolved — see note below
                                </div>
                              )}
                              <div style={{ background: "#F9F9F7", border: "1px solid #E4E2DA", borderRadius: 10, padding: 12 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#8C7D6B", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>Step-by-step solution</div>
                                <div style={{ fontSize: 12.5, color: "#2B2018", lineHeight: 1.6 }}>{q.solution}</div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={() => setPyqStep(pyqSelectionType === "chapter" ? "chapters" : "years")}
                      style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: "1px solid #E4E2DA", background: "#FFFFFF", color: "#2B2018", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                    >
                      ← Pick Another
                    </button>
                    <button
                      onClick={() => generatePyq(pyqSelectionType, pyqSelection)}
                      style={{ flex: 1, padding: "12px 0", borderRadius: 12, border: "1px solid #E4E2DA", background: "#FFFFFF", color: "#2B2018", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                    >
                      <RotateCcw size={15} /> New Set
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {view === "studyplan" && (
            <div className="ibuddie-chat-card" style={{ flex: 1, background: "#FFFFFF", borderRadius: 18, border: "1px solid #E4E2DA", padding: 28, display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto" }}>
              {!studyExamDate || studyPlanStep === "setup" ? (
                <div style={{ margin: "auto", textAlign: "center", maxWidth: 360 }}>
                  <Target size={28} color="#B8860B" style={{ marginBottom: 14 }} />
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#2B2018", marginBottom: 6 }}>Study Plan</div>
                  <div style={{ fontSize: 13, color: "#8C7D6B", marginBottom: 22 }}>When is your {exam} exam?</div>
                  <input
                    type="date"
                    value={studyExamDate}
                    onChange={(e) => setStudyExamDate(e.target.value)}
                    style={{ padding: "12px 16px", borderRadius: 10, border: "1.5px solid #E4E2DA", fontSize: 14, color: "#2B2018", marginBottom: 18 }}
                  />
                  <div>
                    <button
                      disabled={!studyExamDate}
                      onClick={() => {
                        localStorage.setItem("ibuddie_exam_date", studyExamDate);
                        if (user?.uid) {
                          setDoc(doc(db, "users", user.uid, "studyPlan", "current"), { examDate: studyExamDate }, { merge: true }).catch((e) =>
                            console.error("Failed to save exam date to Firestore:", e)
                          );
                        }
                        setStudyPlanStep("analysis");
                      }}
                      style={{ padding: "13px 26px", borderRadius: 12, border: "none", background: studyExamDate ? ACCENT : "#E4E2DA", color: "#fff", fontWeight: 700, fontSize: 14.5, cursor: studyExamDate ? "pointer" : "not-allowed" }}
                    >
                      Continue
                    </button>
                  </div>
                </div>
              ) : studyPlanStep === "loading" ? (
                <div style={{ margin: "auto", textAlign: "center", color: "#8C7D6B", fontSize: 13.5 }}>Building your personalized study plan…</div>
              ) : studyPlanStep === "plan" ? (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, flexWrap: "wrap", gap: 8 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#2B2018" }}>Your {studyPlan.length}-Day Plan</div>
                    <div
                      onClick={() => {
                        localStorage.removeItem("ibuddie_exam_date");
                        setStudyExamDate("");
                        setStudyPlan([]);
                        setStudyPlanCompletedDays([]);
                        setStudyPlanStep("setup");
                        if (user?.uid) {
                          deleteDoc(doc(db, "users", user.uid, "studyPlan", "current")).catch((e) =>
                            console.error("Failed to clear study plan from Firestore:", e)
                          );
                        }
                      }}
                      style={{ fontSize: 12, color: "#8C7D6B", cursor: "pointer", textDecoration: "underline" }}
                    >
                      Change exam date
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, color: "#8C7D6B", marginBottom: 14 }}>Built from your real doubt history — weak topics prioritized first</div>

                  {/* Progress bar */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: "#8C7D6B" }}>{studyPlanCompletedDays.length} of {studyPlan.length} days done</span>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: "#8F6A08" }}>{Math.round((studyPlanCompletedDays.length / studyPlan.length) * 100)}%</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: "#E4E2DA", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${(studyPlanCompletedDays.length / studyPlan.length) * 100}%`, background: ACCENT, borderRadius: 999, transition: "width 0.2s ease" }} />
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
                    {studyPlan.map((d, i) => {
                      // Which plan day number corresponds to today, based on when the plan was generated
                      const daysSinceGenerated = studyPlanGeneratedAt ? Math.floor((Date.now() - studyPlanGeneratedAt) / 86400000) + 1 : null;
                      const isToday = daysSinceGenerated === d.day;
                      const isDone = studyPlanCompletedDays.includes(d.day);
                      const isExpanded = expandedStudyDay === null ? isToday : expandedStudyDay === d.day;
                      return (
                        <div
                          key={i}
                          style={{
                            borderRadius: 12, overflow: "hidden",
                            border: isToday ? `1.5px solid ${ACCENT}` : "1px solid #E4E2DA",
                          }}
                        >
                          <div
                            style={{
                              display: "flex", gap: 14, padding: "14px 16px", cursor: "pointer",
                              background: isToday ? "#B8860B0D" : isDone ? "#F2F2F0" : "#F9F9F7",
                              opacity: isDone ? 0.7 : 1,
                            }}
                            onClick={() => setExpandedStudyDay(isExpanded ? -1 : d.day)}
                          >
                            <div
                              onClick={(e) => { e.stopPropagation(); toggleStudyDayComplete(d.day); }}
                              style={{
                                width: 40, height: 40, borderRadius: 10, flexShrink: 0, cursor: "pointer",
                                background: isDone ? "#2F6B4A" : "#B8860B14", color: isDone ? "#fff" : "#8F6A08",
                                fontSize: 12, fontWeight: 800, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                              }}
                            >
                              {isDone ? <CheckCircle2 size={18} /> : (
                                <>
                                  <div style={{ fontSize: 8, fontWeight: 700 }}>DAY</div>
                                  {d.day}
                                </>
                              )}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#8F6A08", textTransform: "uppercase" }}>{d.subject}</div>
                                {isToday && !isDone && <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: ACCENT, padding: "1px 7px", borderRadius: 999 }}>TODAY</span>}
                                {d.difficulty && <span style={{ fontSize: 9, fontWeight: 700, color: "#8C7D6B", background: "#FFFFFF", border: "1px solid #E4E2DA", padding: "1px 7px", borderRadius: 999 }}>{d.difficulty}</span>}
                              </div>
                              <div style={{ fontSize: 13.5, fontWeight: 700, color: "#2B2018", marginBottom: 2, textDecoration: isDone ? "line-through" : "none" }}>{d.topic || d.focus}</div>
                              {d.timeEstimate && <div style={{ fontSize: 11, color: "#8C7D6B" }}>~{d.timeEstimate}</div>}
                            </div>
                            <ChevronDown size={16} color="#8C7D6B" style={{ flexShrink: 0, marginTop: 3, transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }} />
                          </div>
                          {isExpanded && (
                            <div style={{ padding: "0 16px 16px 70px" }}>
                              {d.tasks && d.tasks.length > 0 && (
                                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                                  {d.tasks.map((task, ti) => (
                                    <div key={ti} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: "#2B2018" }}>
                                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#B8860B", marginTop: 6, flexShrink: 0 }} />
                                      {task}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {d.note && <div style={{ fontSize: 11.5, color: "#8C7D6B", fontStyle: "italic" }}>{d.note}</div>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={generateStudyPlan}
                    style={{ width: "100%", padding: "12px 0", borderRadius: 12, border: "1px solid #E4E2DA", background: "#FFFFFF", color: "#2B2018", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                  >
                    <RotateCcw size={15} /> Regenerate Plan
                  </button>
                </div>
              ) : (() => {
                const weakTopics = analyzeWeakTopics();
                const hasData = Object.keys(weakTopics).length > 0;
                const examHasPassed = new Date(studyExamDate) <= new Date();
                return (
                  <div style={{ margin: "auto", textAlign: "center", maxWidth: 420 }}>
                    <Target size={28} color="#B8860B" style={{ marginBottom: 14 }} />
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#2B2018", marginBottom: 6 }}>
                      {examHasPassed
                        ? "Exam date has passed"
                        : `${Math.max(1, Math.ceil((new Date(studyExamDate) - new Date()) / 86400000))} days until ${exam}`}
                    </div>
                    {examHasPassed && (
                      <div
                        onClick={() => {
                          localStorage.removeItem("ibuddie_exam_date");
                          setStudyExamDate("");
                          setStudyPlanStep("setup");
                        }}
                        style={{ fontSize: 12.5, color: "#8F6A08", fontWeight: 700, cursor: "pointer", textDecoration: "underline", marginBottom: 18 }}
                      >
                        Update your exam date →
                      </div>
                    )}
                    {!hasData ? (
                      <div style={{ fontSize: 13, color: "#8C7D6B", marginBottom: 6 }}>
                        Ask a few doubts in Doubt Desk first — your study plan is built from the topics you've actually struggled with, and there's no history yet.
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: 13, color: "#8C7D6B", marginBottom: 20 }}>Based on your real doubt history, here's what you've asked about most:</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24, textAlign: "left" }}>
                          {Object.entries(weakTopics).map(([subj, topics]) => (
                            <div key={subj}>
                              <div style={{ fontSize: 11, fontWeight: 800, color: "#8F6A08", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>{subj}</div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {topics.map((t) => (
                                  <div key={t.topic} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, background: "#F9F9F7", border: "1px solid #E4E2DA" }}>
                                    <span style={{ fontSize: 12.5, color: "#2B2018" }}>{t.topic}</span>
                                    <span style={{ fontSize: 10.5, fontWeight: 700, color: "#8C7D6B" }}>asked {t.count}x</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                        {!examHasPassed && (
                          <button
                            onClick={generateStudyPlan}
                            style={{ padding: "13px 26px", borderRadius: 12, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, fontSize: 14.5, cursor: "pointer" }}
                          >
                            Generate My Study Plan
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Settings modal */}
          {settingsOpen && (
            <div
              onClick={() => setSettingsOpen(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(20,15,10,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
            >
              <div onClick={(e) => e.stopPropagation()} style={{ background: "#FFFFFF", borderRadius: 18, padding: 24, width: 340 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#2B2018", marginBottom: 16 }}>Settings</div>
                <div style={{ fontSize: 12.5, color: "#8C7D6B", marginBottom: 4 }}>Signed in as</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#2B2018", marginBottom: 18 }}>{user?.name || "—"}</div>
                <div style={{ padding: "10px 0", borderTop: "1px solid #E4E2DA" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "#2B2018" }}>"Hey Darling" wake word</div>
                    <div
                      onClick={() => setWakeWordEnabled((prev) => !prev)}
                      style={{
                        width: 40, height: 22, borderRadius: 999, cursor: "pointer",
                        background: wakeWordEnabled ? GREEN : "#E4E2DA",
                        position: "relative", transition: "background 0.15s ease",
                      }}
                    >
                      <div style={{
                        position: "absolute", top: 2, left: wakeWordEnabled ? 20 : 2,
                        width: 18, height: 18, borderRadius: "50%", background: "#FFFFFF",
                        transition: "left 0.15s ease",
                      }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 11.5, color: "#8C7D6B", marginTop: 4 }}>
                    Keeps the mic listening in the background so saying "Hey Darling" opens a voice call automatically. Only works while this tab is open and focused.
                  </div>
                </div>
                <div
                  onClick={async () => {
                    localStorage.removeItem("ibuddie_messages");
                    if (user?.uid) {
                      try {
                        const snap = await getDocs(collection(db, "users", user.uid, "conversations"));
                        await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
                      } catch (e) {
                        console.error("Failed to clear conversations from Firestore:", e);
                      }
                    }
                    setMessages([]);
                    setConversations([]);
                    setSettingsOpen(false);
                  }}
                  style={{ padding: "10px 0", fontSize: 13.5, fontWeight: 600, color: "#2B2018", cursor: "pointer", borderTop: "1px solid #E4E2DA" }}
                >
                  Clear all chat history
                </div>
                <div
                  onClick={() => { setSettingsOpen(false); onLogout && onLogout(); }}
                  style={{ padding: "10px 0", fontSize: 13.5, fontWeight: 600, color: "#B23B3B", cursor: "pointer", borderTop: "1px solid #E4E2DA" }}
                >
                  Logout
                </div>
                <div
                  onClick={() => setSettingsOpen(false)}
                  style={{ marginTop: 12, textAlign: "center", fontSize: 13, color: "#8C7D6B", cursor: "pointer" }}
                >
                  Close
                </div>
              </div>
            </div>
          )}

          {/* Upgrade modal */}
          {upgradeOpen && upgradeModel && (
            <div
              onClick={() => !upgradeBusy && setUpgradeOpen(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(20,15,10,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
            >
              <div onClick={(e) => e.stopPropagation()} style={{ background: "#FFFFFF", borderRadius: 18, padding: 26, width: 360 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <Crown size={20} color={ACCENT} />
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#2B2018" }}>Upgrade to {MODELS[upgradeModel].label} Pro</div>
                </div>
                <div style={{ fontSize: 13, color: "#8C7D6B", marginBottom: 18 }}>
                  {`You've used all ${MODELS[upgradeModel].freeLimit} free ${MODELS[upgradeModel].label} doubts for ${MODELS[upgradeModel].period === "month" ? "this month" : "today"}. Upgrade for unlimited ${MODELS[upgradeModel].label} access.`}
                </div>
                {[`Unlimited ${MODELS[upgradeModel].label} doubts, every day`, "Priority response speed", "AI Study Plan (coming soon)", "Detailed analytics (coming soon)"].map((f) => (
                  <div key={f} style={{ fontSize: 13.5, color: "#2B2018", marginBottom: 8, display: "flex", gap: 8 }}>
                    <span style={{ color: GREEN, fontWeight: 700 }}>✓</span> {f}
                  </div>
                ))}
                <div style={{ fontSize: 22, fontWeight: 800, color: "#2B2018", marginTop: 14, marginBottom: 2 }}>{MODELS[upgradeModel].priceDisplay}</div>
                <div style={{ fontSize: 11.5, color: "#8C7D6B", marginBottom: 18 }}>Unlimited {MODELS[upgradeModel].label} doubts. Auto-renews monthly — cancel anytime, no lock-in.</div>
                <button
                  onClick={handleUpgrade}
                  disabled={upgradeBusy}
                  style={{
                    width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
                    background: upgradeBusy ? "#E4E2DA" : ACCENT, color: upgradeBusy ? "#8C7D6B" : "#fff",
                    fontWeight: 700, fontSize: 14.5, cursor: upgradeBusy ? "default" : "pointer",
                  }}
                >
                  {upgradeBusy ? "Processing…" : `Subscribe for ${MODELS[upgradeModel].priceDisplay.split("/")[0]}/month`}
                </button>
                <div
                  onClick={() => !upgradeBusy && setUpgradeOpen(false)}
                  style={{ marginTop: 12, textAlign: "center", fontSize: 13, color: "#8C7D6B", cursor: upgradeBusy ? "default" : "pointer" }}
                >
                  Maybe later
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <AvatarWidget
        isSpeaking={speakingIndex !== null}
        isLoading={loadingIndex !== null}
        analyserRef={analyserRef}
      />
      <VoiceCallModal
        open={voiceCallOpen}
        onClose={() => setVoiceCallOpen(false)}
        voiceLang={voiceLang}
        subject={subject}
        exam={exam}
        subjectLabel={currentSubject.label}
        activeModel={MODEL_ORDER.find((key) => subscriptions[key]?.active) || selectedModel}
      />
    </div>
  );
}