import { slugify } from "./voiceService.js";

// Subject + exam must both be part of the key/path: topic names are not unique across
// subjects (e.g. "Thermodynamics" appears in both Physics and Chemistry's PUC syllabus),
// and the same topic's lecture content genuinely differs by exam target (see EXAM_GUIDANCE
// in generate-lecture.js). Without subject+exam in the key, two different lectures would
// silently collide onto the same cache doc / same Storage objects and corrupt each other.
export function lectureCacheKey({ subject, topic, exam }) {
  return `${slugify(subject)}__${exam ? slugify(exam) : "none"}__${slugify(topic)}`;
}

export function lectureStoragePrefix({ subject, topic, exam }) {
  return `lectures/${slugify(subject)}/${exam ? slugify(exam) : "none"}/${slugify(topic)}`;
}
