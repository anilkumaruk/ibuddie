// Converts formula text written with plain ^ and _ notation (e.g. "v^2", "v_rms",
// "a_n = a·r^(n-1)") into real superscript/subscript React elements, instead of showing
// the literal caret/underscore characters. Shared by Formula Bank and AI Lecture.
export function renderFormula(text) {
  const parts = [];
  const regex = /([\^_])(\([^)]+\)|[A-Za-z0-9]+)/g;
  let lastIndex = 0;
  let match;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const [, marker, raw] = match;
    const content = raw.startsWith("(") ? raw.slice(1, -1) : raw;
    if (marker === "^") {
      parts.push(<sup key={key++} style={{ fontSize: "0.72em" }}>{content}</sup>);
    } else {
      parts.push(<sub key={key++} style={{ fontSize: "0.72em" }}>{content}</sub>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}
