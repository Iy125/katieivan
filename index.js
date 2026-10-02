// Cloud Function: when an expense is added, push a notification to the OTHER person's registered devices.
// Deploy:  firebase deploy --only functions      (requires the Blaze plan; usage here stays inside the free tier)
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ region: "europe-west2", maxInstances: 2 });

const NAMES = ["Ivan", "Katie"];
const APP_URL = "https://splitwise-ebf16.web.app/";
const gbp = (p) => "£" + (p / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

exports.notifyNewExpense = onDocumentCreated("households/main/expenses/{id}", async (event) => {
  const e = event.data?.data();
  if (!e) return;
  const db = admin.firestore();

  // Who should be told: everyone except the person who created it. Recurring postings go to both.
  const creatorIdx = NAMES.indexOf(e.createdBy);
  const devicesSnap = await db.collection("households/main/devices").get();
  const targets = devicesSnap.docs.filter((d) => d.data().person !== creatorIdx);
  if (!targets.length) return;

  const isSettlement = e.type === "settlement";
  const title = isSettlement
    ? `${e.createdBy} recorded a payment`
    : creatorIdx >= 0 ? `${e.createdBy} added ${e.desc}` : `${e.desc} posted`;
  const bodyFor = (person) => {
    const net0 = (e.paidBy === 0 ? e.amount : 0) - (e.shares?.[0] ?? 0);
    const mine = person === 0 ? net0 : -net0;
    if (isSettlement) return `${gbp(e.amount)} · ${NAMES[e.paidBy]} paid ${NAMES[1 - e.paidBy]}`;
    return `${gbp(e.amount)} · ${mine === 0 ? "no change for you" : mine > 0 ? `${NAMES[1 - person]} owes you ${gbp(mine)}` : `you owe ${NAMES[1 - person]} ${gbp(-mine)}`}`;
  };

  const sends = targets.map(async (d) => {
    const token = d.id;
    try {
      await admin.messaging().send({
        token,
        data: { title, body: bodyFor(d.data().person), url: APP_URL, tag: `exp-${event.params.id}` },
        webpush: { headers: { Urgency: "high", TTL: "86400" }, fcmOptions: { link: APP_URL } },
      });
    } catch (err) {
      const code = err?.errorInfo?.code || err?.code || "";
      if (code.includes("registration-token-not-registered") || code.includes("invalid-argument")) await d.ref.delete(); // stale device
      else console.error("push failed", token.slice(0, 12), code, err?.message);
    }
  });
  await Promise.all(sends);
});
