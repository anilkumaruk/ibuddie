import { createRoot } from "react-dom/client";
import StaffApp from "./StaffApp.jsx";

// Entry for the staff portal (/staff/) — a separate page from the student app so teachers
// and college admins get their own sign-in and never load the student bundle.
createRoot(document.getElementById("root")).render(<StaffApp />);
