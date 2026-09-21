// Cover Letter — Engineering Resumes style
// Matches the `engineeringresumes` renderCV theme: XCharter, centered header,
// monochrome, pipe-separated contacts. The paper size is parameterized
// (default a4).

#let sender-name = sys.inputs.at("sender_name", default: "")
#let sender-email = sys.inputs.at("sender_email", default: "")
#let sender-phone = sys.inputs.at("sender_phone", default: "")
// POLICY: the sender's location is NEVER printed on the letter. Hardcoded empty
// on purpose — the `sender_location` JSON input is intentionally ignored.
#let sender-location = ""
#let recipient-name = sys.inputs.at("recipient_name", default: "")
#let recipient-title = sys.inputs.at("recipient_title", default: "")
#let company-name = sys.inputs.at("company_name", default: "")
#let company-address = sys.inputs.at("company_address", default: "")
#let date-text = sys.inputs.at("date", default: "")
#let body-content = sys.inputs.at("content", default: "")
// Optional greeting override (e.g. "Dear Bending Spoons team,") — used when the
// greeting isn't a single named person, so it stays decoupled from the address block.
#let salutation = sys.inputs.at("salutation", default: "")
// Optional handwritten signature image (root-relative path, e.g. "/config/signature.png").
#let signature-path = sys.inputs.at("signature", default: "")
// career-ops addition: paper size follows company location (a4 vs us-letter).
#let paper-size = sys.inputs.at("paper", default: "a4")
// Optional closing override (e.g. "Cordialement," for French letters). Defaults
// to "Sincerely," so existing English letters render unchanged.
#let closing = sys.inputs.at("closing", default: "Sincerely,")

#set page(
  paper: paper-size,
  margin: (top: 2cm, bottom: 2cm, left: 2cm, right: 2cm),
)

#set text(
  font: "XCharter",
  size: 10pt,
  fill: rgb(0, 0, 0),
)

#set par(
  leading: 0.6em,
  justify: true,
)

// --- Header: centered name (not bold), pipe-separated contact ---
#align(center)[
  #text(
    font: "XCharter",
    size: 25pt,
    fill: rgb(0, 0, 0),
  )[#sender-name]
]

#v(0.7cm)

// Contact info with pipe separators (no icons). Empty fields are skipped,
// so passing sender_phone="" keeps the phone off the letter.
#align(center)[
  #set text(font: "XCharter", size: 10pt)
  #{
    let parts = ()
    if sender-location != "" {
      parts.push(sender-location)
    }
    if sender-phone != "" {
      parts.push(sender-phone)
    }
    if sender-email != "" {
      parts.push(sender-email)
    }
    parts.join([ | ])
  }
]

#v(0.7cm)

// --- Horizontal rule (matches section title line style) ---
#line(length: 100%, stroke: 0.5pt + rgb(0, 0, 0))

#v(0.5cm)

// --- Date ---
#if date-text != "" {
  text(size: 10pt)[#date-text]
  v(0.5cm)
}

// --- Recipient block ---
#{
  let recipient-lines = ()
  if recipient-name != "" {
    recipient-lines.push(recipient-name)
  }
  if recipient-title != "" {
    recipient-lines.push(recipient-title)
  }
  if company-name != "" {
    recipient-lines.push(company-name)
  }
  if company-address != "" {
    recipient-lines.push(company-address)
  }
  if recipient-lines.len() > 0 {
    for line in recipient-lines {
      text(size: 10pt)[#line]
      linebreak()
    }
    v(0.5cm)
  }
}

// --- Salutation ---
// Explicit `salutation` wins; else "Dear {recipient_name},"; else generic.
#if salutation != "" {
  text(size: 10pt)[#salutation]
} else if recipient-name != "" {
  text(size: 10pt)[Dear #recipient-name,]
} else {
  text(size: 10pt)[Dear Hiring Manager,]
}

#v(0.4cm)

// --- Body content (paragraphs separated by blank lines) ---
#{
  let paragraphs = body-content.split("\n\n")
  for (i, para) in paragraphs.enumerate() {
    let trimmed = para.trim()
    if trimmed != "" {
      text(size: 10pt)[#trimmed]
      if i < paragraphs.len() - 1 {
        v(0.4cm)
      }
    }
  }
}

#v(0.6cm)

// --- Closing ---
#text(size: 10pt)[#closing]

// Handwritten signature above the typed name (if provided).
#if signature-path != "" {
  v(0.1cm)
  image(signature-path, height: 1.5cm)
  v(0.1cm)
} else {
  v(0.4cm)
}

#text(size: 10pt)[#sender-name]
