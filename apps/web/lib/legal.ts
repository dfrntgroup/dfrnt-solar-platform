// Customer-facing legal text. Drafted 1 Nov 2026 for DFRNT Solar's model (fixed price, full payment before install,
// subcontracted licensed installers, STCs assigned to us). DRAFT FOR LEGAL REVIEW before go-live.
// The version string is stored on every signed job, so a later wording change never alters what a customer signed.

export const SELLER = {
  name: "DFRNT Group Pty Ltd",
  trading: "DFRNT Solar",
  abn: "21 679 198 317",
  phone: "1300 133 768",
  email: "hello@dfrntsolar.com.au",
  state: "Queensland",
};

export const AGREEMENT_VERSION = "2026-11-01-draft";
export const PRIVACY_VERSION = "2026-11-01-draft";
export const DRAFT = true;

export type Section = { h: string; p: string[] };

/** The installation agreement. Plain words; every clause matches how the platform actually behaves. */
export const AGREEMENT: Section[] = [
  { h: "1. Who this agreement is between", p: [
    `This agreement is between ${SELLER.name} (ABN ${SELLER.abn}) trading as ${SELLER.trading} ("we", "us") and the person who signs it ("you").`,
    "It is made when you sign it on your system record. Your system record (the page reached from the link we sent you) forms part of this agreement and sets out your system, your address, your price and your install date.",
  ] },
  { h: "2. What we will do", p: [
    "We will supply the equipment listed on your system record and have it installed at your address, connected, commissioned and handed over to you working.",
    "We will apply for grid connection with your electricity distributor on your behalf, complete the Small-scale Technology Certificate (STC) paperwork, and give you your compliance certificate, serial numbers, warranty documents and a record of the installation.",
    "Installation is carried out by a licensed electrical contractor and an accredited solar and battery installer who works as our subcontractor. We stay responsible to you for their work as if we had done it ourselves.",
  ] },
  { h: "3. Your price", p: [
    "The price on your system record is the total you pay. It includes GST, the equipment, mounting and materials, installation, the grid connection application and the STC paperwork, with the rebate already taken off.",
    "We will not increase the price because our own costs go up. The price only changes if you approve a variation under clause 7, or if your rebate changes under clause 4.",
    "Your price was confirmed from the answers and photos you gave us. You agree that they are accurate and show your home as it is.",
  ] },
  { h: "4. The rebate and your STCs", p: [
    "The rebate is the value of the STCs your system creates under the Small-scale Renewable Energy Scheme, including the Cheaper Home Batteries Program. We take it off your price at our fixed rate per STC, so you get the rebate up front.",
    "By signing you assign the right to create those STCs to us (or our nominated agent) and agree to sign the STC assignment form and give the information needed to create them.",
    "If the STCs cannot be created, or fewer are created, because information you gave us was wrong or incomplete (for example, a battery rebate has already been claimed at your address, or your address or unit number was wrong), you must pay us the value of the STCs that were lost. If it is because of something we or our installer did or failed to do, we bear that cost.",
    "The number of STCs depends on the date of installation. Your price holds the rebate for an install on or before the date shown on your record. If we cannot install by that date for reasons within our control, we keep your price. If you ask to move your install past that date, we will re-price at the rebate that applies on the new date before you confirm the change.",
  ] },
  { h: "5. Paying", p: [
    "You pay the full price after signing and before your install date is booked, by bank transfer using the reference on your system record (or by card where we offer it).",
    "Until your payment arrives we do not reserve an install date. If payment has not arrived 7 days after signing, we may release your price lock; you can secure a new price at that time.",
    "The equipment becomes yours when it is installed and you have paid in full. Until then it is at our risk.",
  ] },
  { h: "6. Your home, access and approvals", p: [
    "You agree to give our installer safe access on the install day, including to your switchboard, meter, roof space and the place the battery will go, and to tell us about anything that could affect the work (asbestos, roof damage, pets, other works).",
    "Your distributor decides whether your system can connect and how much it may export. If the distributor refuses connection or imposes a limit that changes what you are buying, we will tell you before any work starts and you can go ahead with the limit or cancel with a full refund.",
    "If the installer finds the site is unsafe or the work cannot be done to the required standards (for example, asbestos in the switchboard), we will tell you what is needed. You can approve that work as a variation or cancel under clause 9.",
  ] },
  { h: "7. Variations", p: [
    "If extra work is needed that was not visible in your photos or answers, the installer records what it is and why, and the price is shown on your system record. No variation work is done unless you approve it there first.",
    "If you decline, we either complete the installation without it (where that is safe and compliant) or you may cancel under clause 9.",
  ] },
  { h: "8. Install date", p: [
    "You choose your install date from the days your installer has free. We will confirm the date and the day before we will remind you.",
    "A date can move for weather, safety, illness or supply delays outside our control. If it moves we will offer you the next free days. You can ask to change your date up to 2 business days before it.",
  ] },
  { h: "9. Cancelling", p: [
    "You may cancel for any reason within 10 business days of signing and we will refund everything you have paid.",
    "After that, you may still cancel before installation. We will refund what you have paid less costs we have actually incurred and cannot recover; once your equipment has been ordered, that includes restocking and freight charges. We will show you those costs with evidence.",
    "We may cancel if the work cannot be done safely or compliantly, if connection is refused, or if we cannot install within a reasonable time. If we cancel, we refund everything you have paid.",
    "Refunds are paid within 10 business days to the account you paid from.",
  ] },
  { h: "10. Handover", p: [
    "On the install day the installer will commission the system, show you how it works and help you set up monitoring. Your compliance certificate, serial numbers, warranty documents and installation photos are added to your system record.",
  ] },
  { h: "11. Warranties", p: [
    "We warrant the installation workmanship for 10 years from the install date. If something goes wrong with how your system was installed, we will fix it at no cost to you.",
    "Manufacturer warranties on panels, inverter and battery are passed on to you in full and are listed on your system record. If a part fails, tell us and we will deal with the manufacturer and the installer for you.",
    "Our goods come with guarantees that cannot be excluded under the Australian Consumer Law. You are entitled to a replacement or refund for a major failure and compensation for any other reasonably foreseeable loss or damage. You are also entitled to have the goods repaired or replaced if the goods fail to be of acceptable quality and the failure does not amount to a major failure.",
    "Nothing in this agreement limits any right you have under the Australian Consumer Law or other law that cannot be excluded.",
  ] },
  { h: "12. Estimates", p: [
    "Any savings, production or backup figures we show you are estimates based on typical conditions. Weather, shading, your usage, your tariff and your distributor's rules all affect real results.",
  ] },
  { h: "13. Complaints", p: [
    `Tell us on your system record, by email at ${SELLER.email} or by phone on ${SELLER.phone}. We will acknowledge your complaint within 2 business days and aim to resolve it within 15 business days, keeping you updated if it takes longer.`,
    "If you are not happy with how we handle it, you can contact the Queensland Office of Fair Trading on 13 74 68 or the consumer protection agency in your state.",
  ] },
  { h: "14. Your information", p: [
    "We collect and use your information as our privacy policy describes, including sharing what is needed with your installer, your distributor, the Clean Energy Regulator and our STC agent.",
  ] },
  { h: "15. General", p: [
    "This agreement, together with your system record, is the whole agreement between us about your system. If they conflict, your system record applies.",
    "You may sign electronically, and an electronic signature is as binding as a signature on paper. We will keep a copy of what you signed on your system record.",
    "The law of Queensland applies.",
  ] },
];

/** Privacy policy. Describes what the platform actually stores and who actually receives it. */
export const PRIVACY: Section[] = [
  { h: "Who we are", p: [
    `${SELLER.name} (ABN ${SELLER.abn}) trading as ${SELLER.trading}. Contact us about privacy at ${SELLER.email} or ${SELLER.phone}.`,
  ] },
  { h: "What we collect", p: [
    "Your name, email, mobile, address and postcode; details about your home (roof, storeys, power supply, switchboard, where a battery would go); photos you upload of your switchboard, meter, roof and battery location; your electricity bill amount if you give it; your signature; payment references; and messages you send us.",
    "Once your system is installed: serial numbers, compliance certificates, installation photos and STC records.",
    "When you use the website we record pages viewed and actions such as configuring a system, using our own first-party analytics. On our public pages (not your system record, our staff areas or installer areas) we also use Microsoft Clarity to see how pages are used (heatmaps and anonymised session recordings, with what you type masked), and the Meta and Google advertising tags so we can measure our ads and show them to people likely to be interested.",
    "When you give us your details, secure a price, sign or pay, we tell Meta and Google Ads that this happened, with the value, so they can measure which ads work. We send your email and phone only as one-way encrypted codes (hashed), never in plain text, plus the click identifiers those platforms gave your browser. We ask you how you heard about us; answering is optional.",
  ] },
  { h: "Your meter data (Consumer Data Right)", p: [
    "If you choose “Use my real power usage”, you share data from your electricity retailer with us through Fiskil Pty Ltd, an accredited data recipient under the Consumer Data Right (CDR). You choose the retailer and the account and confirm on their screen; we never see your retailer login.",
    "We ask only for: electricity usage (up to 12 months of history), meter and connection details (including your NMI), your plan and its rates, and any solar or battery already registered at your address. We do not ask for bills, payments, balances, concessions or your personal details from the retailer.",
    "We use it only to size and price your system, to estimate savings, to show your installer what affects the install (usage, peak demand, existing solar, controlled-load circuit), and after installation to show you a before-and-after comparison and to spot a fault early. We do not use it for marketing and never sell or share it with anyone else.",
    "Your sharing lasts 12 months unless you stop it sooner. You can stop at any time from your usage page or with your retailer; we then delete the data we hold from it. Half-hour readings are deleted 30 days after we receive them; we keep the summary (monthly totals and our sizing results) while your sharing is active and for your before-and-after.",
    "CDR data is handled under the CDR rules and Fiskil's CDR policy as well as this policy. [Draft: wording to be confirmed with our lawyer and Fiskil before live use.]",
  ] },
  { h: "Why we collect it", p: [
    "To price your system, prepare and perform your agreement, book and carry out your installation, apply for grid connection, create and assign STCs, provide warranty support, answer your questions, and meet our legal obligations. We will email you about your quote and installation. If you give us your email for a price, we may also email you about that price, including before rebates change; every such email has an unsubscribe link and we stop straight away when you use it.",
  ] },
  { h: "Who we share it with", p: [
    "Only what each needs: the installer assigned to your job; your electricity distributor (for connection approval); the Clean Energy Regulator and our STC agent (to create your STCs); equipment suppliers and manufacturers (delivery and warranty); our payment, email, SMS, accounting (Xero) and hosting providers; Meta and Google as described above; Microsoft (Clarity) for website analytics; and anyone the law requires.",
    "We do not sell your information.",
  ] },
  { h: "Where it is stored", p: [
    "Our database and files are hosted in Sydney. Some of our service providers (for example, website hosting and email delivery) may process information outside Australia; we choose providers that protect it to Australian standards.",
  ] },
  { h: "Access, correction and deletion", p: [
    "You can ask to see or correct the information we hold about you at any time. We keep installation and STC records for as long as the law and your warranties require, then delete them.",
  ] },
  { h: "Complaints", p: [
    "Tell us first and we will respond within 30 days. If you are not satisfied, you can contact the Office of the Australian Information Commissioner (oaic.gov.au, 1300 363 992).",
  ] },
];

/** Website terms: what a price on the site means. */
export const TERMS: Section[] = [
  { h: "Prices on this website", p: [
    "Every price is the installed price for the postcode shown, including GST, with the rebate taken off at our fixed rate. It assumes a standard install: single storey, tin roof, a switchboard with space, and the battery within 5 m of it. Anything else is priced from your photos before you pay, and you approve it first.",
    "A price becomes yours when you secure it. It is then locked for 14 days, or to the end of the current rebate period if that comes first.",
  ] },
  { h: "Buying", p: [
    "Your purchase is governed by the installation agreement you sign on your system record. You can read it before you start.",
  ] },
  { h: "Availability", p: [
    "Systems are available in postcodes our installers cover. If we do not cover your postcode yet, we show prices so you can plan and tell you when we do.",
  ] },
  { h: "Information on this website", p: [
    "We work to keep everything here accurate. Savings and production figures are estimates. Rebate rules are set by the government and can change; the rules on your install date apply.",
  ] },
  { h: "Reviews", p: [
    "Reviews come only from customers whose systems we installed. We publish them good or bad and do not pay for or edit them; we only remove reviews that are not from a real install or that break the law.",
  ] },
];
