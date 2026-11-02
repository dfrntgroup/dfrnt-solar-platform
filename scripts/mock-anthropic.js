// Mock Claude API for local agent tests: scripted tool calls by agent and turn.
const http = require("http");
const uuid = (s, k) => (s.match(new RegExp(`${k} ([0-9a-f-]{36})`)) || [])[1];
http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => {
    const j = JSON.parse(b); const sys = j.system || ""; const ctx = typeof j.messages[0].content === "string" ? j.messages[0].content : "";
    const turn = j.messages.filter((m) => m.role === "assistant").length;
    const tool = (name, input, text = "Doing the next step.") => ({ content: [{ type: "text", text }, { type: "tool_use", id: `tu_${Math.random().toString(36).slice(2)}`, name, input }], stop_reason: "tool_use" });
    const done = (t) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn" });
    let out;
    if (sys.includes("Support agent")) {
      const t = uuid(ctx, "ticket_id"), q = uuid(ctx, "quote_id"); const low = ctx.toLowerCase();
      if (turn === 0 && q) out = tool("read_record", { quote_id: q }, "Checking the record first.");
      else if (turn <= 1) {
        if (low.includes("refund") || low.includes("cracked")) out = tool("route_to_person", { ticket_id: t, note: "Unhappy customer: needs a person today.", urgent: true }, "This needs a person.");
        else if (low.includes("call me") || low.includes("call ")) out = tool("book_call_back", { ticket_id: t, when: "tomorrow around 10am" });
        else if (low.includes("photo")) out = tool("request_retake", { quote_id: q, which: "meter", why: "The first one was too dark to read the meter number." });
        else if (low.includes("tesla")) out = tool("route_to_person", { ticket_id: t, note: "Asks about a product we don't sell.", urgent: false });
        else if (low.includes("20%")) out = tool("reply_to_customer", { ticket_id: t, body: "Hi Sarah, thanks for your message. Our prices are fixed and the same for everyone, so I can't change yours, but a person will be in touch today if you have questions." });
        else out = tool("reply_to_customer", { ticket_id: t, body: "Hi Sarah, your install is booked for Thursday 5 November with Faultless Solar, arriving between 7 and 8 am. Your record has everything else." });
      } else out = done("Handled the ticket.");
    } else if (sys.includes("Ops agent")) {
      if (turn === 0) out = tool("list_stuck_jobs", {}, "Looking for stuck jobs.");
      else if (turn === 1) {
        const last = j.messages[j.messages.length - 1].content[0].content; let list = []; try { list = JSON.parse(last) || []; } catch {}
        if (!list.length) out = done("Nothing stuck today.");
        else { const s = list[0]; const r = s.reason || "";
          if (r.includes("Installer")) out = tool("nudge_installer", { quote_id: s.quote_id, body: "Hi, could you price this job from the photos today please? The customer is waiting." });
          else if (r.includes("photos")) out = tool("nudge_customer", { quote_id: s.quote_id, body: "Hi, just a reminder to add your home details and photos so we can confirm your price. It takes about two minutes." });
          else if (r.includes("purchase")) out = tool("draft_purchase_orders", { quote_id: s.quote_id });
          else out = tool("team_note", { quote_id: s.quote_id, note: `Stuck: ${r}` }); }
      } else out = done("Sweep done.");
    } else out = done("ok");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ id: "msg_mock", type: "message", role: "assistant", model: j.model, ...out, usage: { input_tokens: 1200, output_tokens: 150 } }));
  });
}).listen(4020, () => console.log("mock claude on 4020"));
