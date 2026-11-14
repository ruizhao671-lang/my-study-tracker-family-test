export const TUM_EI_BACHELOR = {
  name: "TUM · Elektrotechnik und Informationstechnik (B.Sc.)",
  requiredCredits: 180,
  modules: [
    {
      name: "Mathematik",
      requiredCredits: 32,
      courses: [
        { code: "MA9409", name: "Lineare Algebra", credits: 7 },
        { code: "MA9411", name: "Analysis 1", credits: 6 },
        { code: "MA9412", name: "Analysis 2", credits: 7 },
        { code: "MA9413", name: "Analysis 3", credits: 7 }
      ],
      choices: [
        { code: "EI00460", name: "Diskrete Mathematik für Ingenieure", credits: 5 },
        { code: "MA9410", name: "Numerische Mathematik", credits: 5 }
      ]
    },
    {
      name: "Physik",
      requiredCredits: 24,
      courses: [
        { code: "EI00210", name: "Elektrizität und Magnetismus", credits: 5 },
        { code: "PH9009", name: "Physik für Elektroingenieure", credits: 6 },
        { code: "EI00310", name: "Elektromagnetische Feldtheorie", credits: 6 },
        { code: "EI00320", name: "Festkörper-, Halbleiter- und Bauelementephysik", credits: 7 }
      ]
    },
    {
      name: "Informationstechnik",
      requiredCredits: 17,
      courses: [
        { code: "EI00110", name: "Computertechnik und Programmieren", credits: 6 },
        { code: "EI00120", name: "Digitaltechnik", credits: 5 },
        { code: "IN8009", name: "Algorithmen und Datenstrukturen", credits: 6 }
      ]
    },
    {
      name: "Signale & Systeme",
      requiredCredits: 26,
      courses: [
        { code: "EI00220", name: "Systemtheorie", credits: 6 },
        { code: "EI00330", name: "Signaltheorie", credits: 5 },
        { code: "EI00340", name: "Stochastische Signale", credits: 5 },
        { code: "EI00440", name: "Nachrichtentechnik", credits: 5 },
        { code: "EI00450", name: "Regelungssysteme", credits: 5 }
      ]
    },
    {
      name: "Elektrotechnik",
      requiredCredits: 21,
      courses: [
        { code: "EI00130", name: "Schaltungstheorie", credits: 6 },
        { code: "EI00410", name: "Elektrische Energietechnik", credits: 5 },
        { code: "EI00420", name: "Elektronische Schaltungen", credits: 5 },
        { code: "EI00430", name: "Messsystem- und Sensortechnik", credits: 5 }
      ]
    },
    { name: "Fachliche Wahlmodule", requiredCredits: 30, kind: "elective", courses: [] },
    { name: "FIQ / Soft Skills", requiredCredits: 6, kind: "elective", courses: [] },
    {
      name: "Ingenieurpraxis",
      requiredCredits: 12,
      courses: [
        { name: "Ingenieurpraxis · Teil 1", credits: 6 },
        { name: "Ingenieurpraxis · Teil 2", credits: 6 }
      ]
    },
    {
      name: "Bachelorarbeit",
      requiredCredits: 12,
      courses: [{ name: "Bachelorarbeit", credits: 12 }]
    }
  ]
};