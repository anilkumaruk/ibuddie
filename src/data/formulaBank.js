// Curated formula reference, organized the same way as PUC_SYLLABUS for consistent
// navigation. Hardcoded rather than AI-generated — formulas are exactly the kind of
// content where an error could seriously mislead a student, so this prioritizes
// verified correctness over exhaustive coverage. Biology is intentionally excluded —
// it's fact/process-based, not formula-based, and doesn't fit this feature well.

export const FORMULA_BANK = {
  Physics: {
    "1st": {
      "Physical World and Measurement": [
        { name: "Dimensional formula check", formula: "[Quantity] = [M^a L^b T^c]", note: "Use to verify an equation is dimensionally consistent before trusting it." },
        { name: "Percentage error", formula: "% error = (|Measured - True| / True) x 100" },
      ],
      "Kinematics": [
        { name: "First equation of motion", formula: "v = u + at" },
        { name: "Second equation of motion", formula: "s = ut + (1/2)at^2" },
        { name: "Third equation of motion", formula: "v^2 = u^2 + 2as" },
        { name: "Relative velocity", formula: "v_AB = v_A - v_B" },
        { name: "Projectile range", formula: "R = (u^2 sin2θ) / g" },
        { name: "Projectile max height", formula: "H = (u^2 sin^2θ) / 2g" },
      ],
      "Laws of Motion": [
        { name: "Newton's second law", formula: "F = ma" },
        { name: "Momentum", formula: "p = mv" },
        { name: "Friction force", formula: "f = μN" },
        { name: "Centripetal force", formula: "F = mv^2/r" },
      ],
      "Work, Energy and Power": [
        { name: "Work done", formula: "W = F.s.cosθ" },
        { name: "Kinetic energy", formula: "KE = (1/2)mv^2" },
        { name: "Gravitational PE", formula: "PE = mgh" },
        { name: "Power", formula: "P = W/t = F.v" },
        { name: "Spring PE", formula: "PE = (1/2)kx^2" },
      ],
      "Motion of System of Particles and Rigid Body": [
        { name: "Center of mass", formula: "x_cm = (Σm_i x_i) / Σm_i" },
        { name: "Torque", formula: "τ = r x F = rFsinθ" },
        { name: "Moment of inertia (point mass)", formula: "I = mr^2" },
        { name: "Angular momentum", formula: "L = Iω" },
      ],
      "Gravitation": [
        { name: "Newton's law of gravitation", formula: "F = Gm1m2/r^2" },
        { name: "Escape velocity", formula: "v_e = sqrt(2GM/R)" },
        { name: "Orbital velocity", formula: "v_o = sqrt(GM/r)" },
        { name: "Time period (satellite)", formula: "T = 2π sqrt(r^3/GM)" },
      ],
      "Mechanical Properties of Solids and Fluids": [
        { name: "Young's modulus", formula: "Y = (F/A) / (ΔL/L)" },
        { name: "Pressure in fluid", formula: "P = P0 + ρgh" },
        { name: "Bernoulli's equation", formula: "P + (1/2)ρv^2 + ρgh = constant" },
        { name: "Terminal velocity (Stokes)", formula: "v_t = (2r^2(ρ-σ)g) / 9η" },
      ],
      "Thermal Properties of Matter": [
        { name: "Linear expansion", formula: "ΔL = L·α·ΔT" },
        { name: "Heat transfer", formula: "Q = mcΔT" },
        { name: "Latent heat", formula: "Q = mL" },
      ],
      "Thermodynamics": [
        { name: "First law", formula: "ΔU = Q - W" },
        { name: "Work done (isothermal)", formula: "W = nRT·ln(V2/V1)" },
        { name: "Efficiency (Carnot)", formula: "η = 1 - (T2/T1)" },
      ],
      "Kinetic Theory": [
        { name: "Ideal gas law", formula: "PV = nRT" },
        { name: "Average KE per molecule", formula: "KE = (3/2)kT" },
        { name: "RMS speed", formula: "v_rms = sqrt(3RT/M)" },
      ],
      "Oscillations": [
        { name: "SHM displacement", formula: "x = A·sin(ωt + φ)" },
        { name: "SHM period (spring)", formula: "T = 2π·sqrt(m/k)" },
        { name: "SHM period (pendulum)", formula: "T = 2π·sqrt(L/g)" },
      ],
      "Waves": [
        { name: "Wave speed", formula: "v = fλ" },
        { name: "Speed on a string", formula: "v = sqrt(T/μ)" },
        { name: "Beat frequency", formula: "f_beat = |f1 - f2|" },
      ],
    },
    "2nd": {
      "Electrostatics": [
        { name: "Coulomb's law", formula: "F = kq1q2/r^2" },
        { name: "Electric field", formula: "E = F/q = kQ/r^2" },
        { name: "Electric potential", formula: "V = kQ/r" },
        { name: "Capacitance", formula: "C = Q/V" },
        { name: "Energy in capacitor", formula: "U = (1/2)CV^2" },
      ],
      "Current Electricity": [
        { name: "Ohm's law", formula: "V = IR" },
        { name: "Resistivity", formula: "R = ρL/A" },
        { name: "Power dissipated", formula: "P = I^2R = VI" },
        { name: "Series resistors", formula: "R_eq = R1 + R2 + ..." },
        { name: "Parallel resistors", formula: "1/R_eq = 1/R1 + 1/R2 + ..." },
      ],
      "Magnetic Effects of Current and Magnetism": [
        { name: "Force on moving charge", formula: "F = qvB·sinθ" },
        { name: "Force on current-carrying wire", formula: "F = BIL·sinθ" },
        { name: "Field due to long straight wire", formula: "B = μ0I / 2πr" },
        { name: "Field at center of loop", formula: "B = μ0I / 2r" },
      ],
      "Electromagnetic Induction and AC": [
        { name: "Faraday's law (EMF)", formula: "ε = -dΦ/dt" },
        { name: "Motional EMF", formula: "ε = BLv" },
        { name: "RMS value (AC)", formula: "I_rms = I0/√2" },
        { name: "Inductive reactance", formula: "X_L = ωL" },
        { name: "Capacitive reactance", formula: "X_C = 1/ωC" },
      ],
      "Electromagnetic Waves": [
        { name: "Speed of EM wave in vacuum", formula: "c = 1/sqrt(μ0ε0)" },
        { name: "Speed in medium", formula: "v = c/n" },
      ],
      "Ray Optics and Optical Instruments": [
        { name: "Mirror formula", formula: "1/f = 1/v + 1/u" },
        { name: "Lens formula", formula: "1/f = 1/v - 1/u" },
        { name: "Lens maker's formula", formula: "1/f = (n-1)(1/R1 - 1/R2)" },
        { name: "Snell's law", formula: "n1·sinθ1 = n2·sinθ2" },
        { name: "Magnification", formula: "m = v/u" },
      ],
      "Wave Optics": [
        { name: "Young's double slit fringe width", formula: "β = λD/d" },
        { name: "Path difference (constructive)", formula: "Δ = nλ" },
      ],
      "Dual Nature of Matter and Radiation": [
        { name: "Photon energy", formula: "E = hf = hc/λ" },
        { name: "Einstein's photoelectric equation", formula: "KE_max = hf - φ" },
        { name: "de Broglie wavelength", formula: "λ = h/p" },
      ],
      "Atoms and Nuclei": [
        { name: "Bohr radius", formula: "r_n = n^2·(h^2ε0) / (πme^2)" },
        { name: "Mass-energy equivalence", formula: "E = mc^2" },
        { name: "Radioactive decay", formula: "N = N0·e^(-λt)" },
        { name: "Half-life", formula: "t_1/2 = ln2 / λ" },
      ],
      "Electronic Devices": [
        { name: "Diode equation (forward bias, conceptual)", formula: "I = I0(e^(qV/kT) - 1)" },
      ],
    },
  },

  Chemistry: {
    "1st": {
      "Some Basic Concepts of Chemistry": [
        { name: "Moles", formula: "n = mass / molar mass" },
        { name: "Molarity", formula: "M = moles of solute / L of solution" },
        { name: "Molality", formula: "m = moles of solute / kg of solvent" },
      ],
      "Structure of Atom": [
        { name: "Energy of photon", formula: "E = hν = hc/λ" },
        { name: "Bohr's model energy", formula: "E_n = -13.6/n^2 eV (for H atom)" },
        { name: "de Broglie wavelength", formula: "λ = h/mv" },
      ],
      "States of Matter": [
        { name: "Ideal gas equation", formula: "PV = nRT" },
        { name: "Combined gas law", formula: "P1V1/T1 = P2V2/T2" },
        { name: "Graham's law of diffusion", formula: "r1/r2 = sqrt(M2/M1)" },
      ],
      "Thermodynamics": [
        { name: "First law", formula: "ΔU = q + w" },
        { name: "Enthalpy", formula: "ΔH = ΔU + PΔV" },
        { name: "Gibbs free energy", formula: "ΔG = ΔH - TΔS" },
      ],
      "Equilibrium": [
        { name: "Equilibrium constant", formula: "Kc = [products] / [reactants]" },
        { name: "pH", formula: "pH = -log[H+]" },
        { name: "pOH", formula: "pOH = -log[OH-]" },
        { name: "pH + pOH relation", formula: "pH + pOH = 14 (at 25°C)" },
      ],
      "Redox Reactions": [
        { name: "Oxidation number rule", formula: "Sum of oxidation states = overall charge" },
      ],
    },
    "2nd": {
      "Solutions": [
        { name: "Raoult's law", formula: "P = P°·x_solvent" },
        { name: "Depression in freezing point", formula: "ΔTf = Kf·m" },
        { name: "Elevation in boiling point", formula: "ΔTb = Kb·m" },
        { name: "van't Hoff factor", formula: "i = observed value / expected value" },
      ],
      "Electrochemistry": [
        { name: "Nernst equation", formula: "E = E° - (RT/nF)·lnQ" },
        { name: "Faraday's first law", formula: "m = ZIt" },
        { name: "Molar conductivity", formula: "Λm = κ / C" },
      ],
      "Chemical Kinetics": [
        { name: "Rate law", formula: "Rate = k[A]^m[B]^n" },
        { name: "First-order integrated rate law", formula: "k = (2.303/t)·log([A0]/[A])" },
        { name: "Half-life (first order)", formula: "t_1/2 = 0.693/k" },
        { name: "Arrhenius equation", formula: "k = A·e^(-Ea/RT)" },
      ],
      "Solid State": [
        { name: "Density of unit cell", formula: "ρ = ZM / (NA·a^3)" },
      ],
    },
  },

  Mathematics: {
    "1st": {
      "Trigonometric Functions": [
        { name: "Pythagorean identity", formula: "sin^2θ + cos^2θ = 1" },
        { name: "sin(A+B)", formula: "sin(A+B) = sinA·cosB + cosA·sinB" },
        { name: "cos(A+B)", formula: "cos(A+B) = cosA·cosB - sinA·sinB" },
        { name: "Double angle (sin)", formula: "sin2θ = 2sinθ·cosθ" },
        { name: "Double angle (cos)", formula: "cos2θ = cos^2θ - sin^2θ" },
      ],
      "Complex Numbers": [
        { name: "Modulus", formula: "|z| = sqrt(a^2 + b^2), where z = a + bi" },
        { name: "Quadratic formula", formula: "x = (-b ± sqrt(b^2-4ac)) / 2a" },
      ],
      "Permutations and Combinations": [
        { name: "Permutations", formula: "nPr = n! / (n-r)!" },
        { name: "Combinations", formula: "nCr = n! / (r!(n-r)!)" },
      ],
      "Binomial Theorem": [
        { name: "Binomial expansion", formula: "(x+y)^n = Σ nCr·x^(n-r)·y^r" },
      ],
      "Sequences and Series": [
        { name: "AP nth term", formula: "a_n = a + (n-1)d" },
        { name: "AP sum", formula: "S_n = n/2·(2a + (n-1)d)" },
        { name: "GP nth term", formula: "a_n = a·r^(n-1)" },
        { name: "GP sum (finite)", formula: "S_n = a(r^n - 1)/(r-1)" },
      ],
      "Straight Lines": [
        { name: "Slope", formula: "m = (y2-y1)/(x2-x1)" },
        { name: "Point-slope form", formula: "y - y1 = m(x - x1)" },
        { name: "Distance between two points", formula: "d = sqrt((x2-x1)^2 + (y2-y1)^2)" },
      ],
      "Limits and Derivatives": [
        { name: "Power rule", formula: "d/dx(x^n) = n·x^(n-1)" },
        { name: "Product rule", formula: "d/dx(uv) = u'v + uv'" },
        { name: "Quotient rule", formula: "d/dx(u/v) = (u'v - uv') / v^2" },
      ],
    },
    "2nd": {
      "Matrices": [
        { name: "Determinant (2x2)", formula: "|A| = ad - bc, for [[a,b],[c,d]]" },
      ],
      "Continuity and Differentiability": [
        { name: "Chain rule", formula: "dy/dx = (dy/du)·(du/dx)" },
      ],
      "Application of Derivatives": [
        { name: "Rate of change", formula: "dy/dx at a point gives instantaneous rate" },
      ],
      "Integrals": [
        { name: "Power rule (integration)", formula: "∫x^n dx = x^(n+1)/(n+1) + C" },
        { name: "Integral of 1/x", formula: "∫(1/x) dx = ln|x| + C" },
        { name: "Integral of e^x", formula: "∫e^x dx = e^x + C" },
      ],
      "Differential Equations": [
        { name: "General first-order linear form", formula: "dy/dx + Py = Q" },
      ],
      "Vector Algebra": [
        { name: "Dot product", formula: "a.b = |a||b|cosθ" },
        { name: "Cross product magnitude", formula: "|a x b| = |a||b|sinθ" },
      ],
      "Three Dimensional Geometry": [
        { name: "Distance between two points (3D)", formula: "d = sqrt((x2-x1)^2 + (y2-y1)^2 + (z2-z1)^2)" },
      ],
      "Probability": [
        { name: "Conditional probability", formula: "P(A|B) = P(A∩B) / P(B)" },
        { name: "Bayes' theorem", formula: "P(A|B) = P(B|A)·P(A) / P(B)" },
      ],
    },
  },
};