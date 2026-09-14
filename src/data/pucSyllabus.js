// Standard Karnataka PUC / NCERT-aligned chapter lists, used for the PYQ Bank's
// browse-by-chapter mode. Hardcoded rather than AI-generated since syllabus structure
// is stable factual data, not something worth risking a generation failure over.
// Shared by Mock Test (chapter mode), PYQ Bank (chapter browse), and AI Lecture (topic picker).
export const PUC_SYLLABUS = {
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
