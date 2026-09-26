// Populate only the isolated sample client. Run explicitly with:
// node script/seed-demo-showcase.cjs --production
// No schema changes, external API calls, password changes, or real-client writes.
const { Pool } = require("pg");

if (process.argv[2] !== "--production" || !process.env.PRODUCTION_DATABASE_URL) {
  console.error("Requires --production and a configured production database connection.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.PRODUCTION_DATABASE_URL });
const days = (offset) => new Date(Date.now() + offset * 86400000);
const counts = {};
let db;

async function ensure(selectSql, selectParams, insertSql, insertParams, category) {
  const existing = await db.query(selectSql, selectParams);
  if (existing.rows.length) return existing.rows[0].id;
  const inserted = await db.query(`${insertSql} RETURNING id`, insertParams);
  counts[category] = (counts[category] || 0) + 1;
  return inserted.rows[0].id;
}

async function run() {
  db = await pool.connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock($1)", [86572113]);
    const accounts = (await db.query(`
      SELECT u.id, u.role, u.agency_id, u.client_access, a.name AS agency_name,
             c.name AS client_name
      FROM users u
      JOIN agencies a ON a.id = u.agency_id
      JOIN clients c ON c.id = u.client_access[1]
      WHERE u.id IN ('demo-client:sample', 'demo-client:sample-admin')
    `)).rows;
    if (accounts.length !== 2 || accounts.some(u =>
      u.agency_name !== "EventHQ Demo Agency" ||
      u.client_name !== "EventHQ Sample Workspace" ||
      u.client_access.length !== 1 ||
      u.agency_id !== accounts[0].agency_id ||
      u.client_access[0] !== accounts[0].client_access[0]
    ) || accounts.find(u => u.id === "demo-client:sample")?.role !== "agency_client" ||
      accounts.find(u => u.id === "demo-client:sample-admin")?.role !== "agency_admin") {
      throw new Error("Demo identities are not isolated; no sample data was written.");
    }
    const clientId = accounts[0].client_access[0];
    const agencyId = accounts[0].agency_id;
    const clientCount = (await db.query("SELECT count(*)::int AS count FROM clients WHERE agency_id=$1", [agencyId])).rows[0].count;
    if (clientCount !== 1) throw new Error("Demo agency has more than one client; no sample data was written.");

    await db.query(`
      UPDATE clients SET full_name='EventHQ Demo Client',
        business_name='EventHQ Sample Studio',
        niche='Virtual events and education',
        primary_offer='Event Growth Intensive',
        brand_voice_tone=ARRAY['Clear', 'Encouraging', 'Practical'],
        brand_voice_dos='Lead with useful examples and specific next steps.',
        brand_voice_donts='Avoid hype and exaggerated guarantees.',
        style_guide='Friendly, concise copy with clear calls to action.',
        email='eventhq.client@example.com',
        updated_at=now()
      WHERE id=$1 AND agency_id=$2
    `, [clientId, agencyId]);

    const eventDefs = [
      ["Your First Masterclass", "webinar", 14, "A practical plan for turning an idea into a live event"],
      ["Five-Day Launch Sprint", "free_challenge", 31, "Build and launch a simple offer in five days"],
      ["Creator Growth Summit", "summit", 58, "Learn from independent event creators"],
    ];
    const eventIds = {};
    for (const [name, type, day, hook] of eventDefs) {
      eventIds[name] = await ensure(
        "SELECT id FROM events WHERE client_id=$1 AND name=$2 LIMIT 1", [clientId, name],
        `INSERT INTO events (client_id,name,type,start_date,timezone,hook,status,target_audience,
          audience_pains,audience_outcomes,utm_source,utm_medium,utm_campaign)
          VALUES ($1,$2,$3,$4,'America/New_York',$5,'completed',
          'Independent creators and small teams','Inconsistent launches and unclear metrics',
          'A repeatable launch plan','demo','email','showcase')`,
        [clientId, name, type, days(day), hook], "events");
    }

    const assetDefs = [
      [eventIds["Your First Masterclass"], "email_sequence", "Masterclass invitation emails",
        "# Invitation sequence\n\n**Email 1 — Save your seat**\nSubject: Your next event starts here\n\nJoin us for a practical masterclass on planning an event that converts. Reserve your place today.\n\n**Email 2 — One day to go**\nBring your biggest event question. We will build a simple action plan together.", "approved"],
      [eventIds["Your First Masterclass"], "social_posts", "Social launch posts",
        "# Social launch pack\n\n**Announcement:** Ready to make your next virtual event easier to launch? Join our free masterclass.\n\n**Reminder:** We go live tomorrow. Save your seat and bring a question.", "in_review"],
      [eventIds["Five-Day Launch Sprint"], "marketing_plan", "Five-day launch plan",
        "# Launch plan\n\nDay 1: Clarify the audience and promise.\nDay 2: Publish the landing page.\nDay 3: Email your list and partners.\nDay 4: Share three helpful social posts.\nDay 5: Host the live session and follow up.", "approved"],
      [eventIds["Creator Growth Summit"], "slide_outline", "Summit opening session outline",
        "# Session outline\n\n1. Welcome and agenda\n2. The three stages of a repeatable event\n3. Guest stories and examples\n4. Audience questions\n5. Next steps", "draft"],
    ];
    for (const [eventId, type, title, content, status] of assetDefs) {
      await ensure("SELECT id FROM assets WHERE event_id=$1 AND title=$2 LIMIT 1", [eventId, title],
        "INSERT INTO assets (event_id,asset_type,title,content,status,owner_role) VALUES ($1,$2,$3,$4,$5,'Copy')",
        [eventId, type, title, content, status], "assets");
    }

    const performanceDefs = [
      ["Your First Masterclass — September", "webinar", -9, 1, 412, 186, "1240.00",
        [{ id: "core", name: "Event Playbook", price: 97, quantity: 28 }],
        [{ id: "upgrade", name: "Workshop Upgrade", price: 47, quantity: 11 }], "3233.00"],
      ["Five-Day Launch Sprint — September", "challenge", -19, 5, 690, 328, "2850.00",
        [{ id: "general", name: "General Access", price: 97, quantity: 42 },
          { id: "vip", name: "VIP Pass", price: 297, quantity: 9 }],
        [{ id: "review", name: "Personal Review", price: 47, quantity: 14 }], "7405.00"],
      ["Creator Growth Summit — August", "summit", -43, 2, 530, 241, "1950.00",
        [{ id: "pass", name: "Summit Pass", price: 79, quantity: 36 },
          { id: "vip", name: "VIP Experience", price: 149, quantity: 12 }],
        [{ id: "replay", name: "Replay Bundle", price: 29, quantity: 18 }], "5154.00"],
    ];
    const performanceIds = {};
    for (const [title, type, offset, duration, registrants, attendees, spend, tickets, upsells, revenue] of performanceDefs) {
      performanceIds[title] = await ensure(
        "SELECT id FROM event_performance WHERE client_id=$1 AND title=$2 LIMIT 1", [clientId, title],
        `INSERT INTO event_performance
          (client_id,title,event_type,start_date,end_date,number_of_days,total_registrants,
           total_attendees,ad_spend,offer_type,sales_data,upsell_data,total_revenue,profit,roas,
           notes,data_source)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'tickets',$10::jsonb,$11::jsonb,$12,$13,$14,
            'Illustrative sample campaign — not real customer results','manual')`,
        [clientId, title, type, days(offset), days(offset + duration - 1), duration, registrants, attendees,
          spend, JSON.stringify(tickets), JSON.stringify(upsells), revenue,
          (Number(revenue) - Number(spend)).toFixed(2), (Number(revenue) / Number(spend)).toFixed(2)], "event_performance");
    }
    for (let day = 1; day <= 5; day++) {
      await ensure("SELECT id FROM event_day_stats WHERE event_performance_id=$1 AND day_number=$2 LIMIT 1",
        [performanceIds["Five-Day Launch Sprint — September"], day],
        `INSERT INTO event_day_stats
          (event_performance_id,day_number,day_date,day_title,registrants_for_day,attendees_for_day)
          VALUES ($1,$2,$3,$4,$5,$6)`,
        [performanceIds["Five-Day Launch Sprint — September"], day, days(-20 + day),
          `Day ${day}: ${["Set the goal", "Shape the offer", "Build the page", "Invite the audience", "Go live"][day - 1]}`,
          690, 328 - (day - 1) * 29], "event_day_stats");
    }

    const webinarDefs = [
      ["Your First Masterclass — Live", -9, "live", 412, 186, 132, 11, 28, "1240.00"],
      ["The Event Growth Workshop", -24, "live", 305, 139, 99, 8, 19, "920.00"],
      ["Next Steps Masterclass", 14, "live", 84, 0, 0, 0, 0, "0.00"],
    ];
    for (const [title, day, type, registrants, attendees, pitch, upsells, tickets, spend] of webinarDefs) {
      await ensure("SELECT id FROM webinars WHERE client_id=$1 AND title=$2 LIMIT 1", [clientId, title],
        `INSERT INTO webinars
          (client_id,title,date,webinar_type,total_registrants,total_attendees,people_at_pitch,
           masterclass_upsells,challenge_tickets_ga,challenge_tickets_vip,ad_spend,notes)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,3,$10,
            'Sample metrics for the EventHQ demo workspace')`,
        [clientId, title, days(day), type, registrants, attendees, pitch, upsells, tickets, spend], "webinars");
    }

    await ensure("SELECT id FROM webinar_goals WHERE client_id=$1 AND name=$2 LIMIT 1",
      [clientId, "Sample quarterly targets"],
      `INSERT INTO webinar_goals
        (client_id,name,period_type,target_revenue,target_registrants,target_attendee_rate,
         target_closing_rate,target_roas,target_webinars)
        VALUES ($1,$2,'quarterly','18000.00',1500,'40','8','3',4)`,
      [clientId, "Sample quarterly targets"], "webinar_goals");
    await ensure("SELECT id FROM event_goals WHERE client_id=$1 AND name=$2 LIMIT 1",
      [clientId, "Sample event targets"],
      `INSERT INTO event_goals
        (client_id,name,period_type,target_revenue,target_registrants,target_attendee_rate,
         target_closing_rate,target_roas,target_events)
        VALUES ($1,$2,'monthly','9000.00',800,'42','7','3',2)`,
      [clientId, "Sample event targets"], "event_goals");

    const saleProducts = ["Event Playbook", "VIP Workshop Pass", "Event Playbook",
      "Launch Sprint Ticket", "Event Playbook", "Replay Bundle"];
    for (let i = 0; i < 18; i++) {
      const key = `eventhq-showcase-sale-${i + 1}`;
      const amount = i % 6 === 1 ? "297.00" : i % 6 === 5 ? "47.00" : "97.00";
      await ensure("SELECT id FROM sales WHERE client_id=$1 AND dedupe_key=$2 LIMIT 1", [clientId, key],
        `INSERT INTO sales
          (client_id,amount,sale_date,product_name,customer_name,source,status,currency,
           external_id,dedupe_key,event_performance_id,metadata)
          VALUES ($1,$2,$3,$4,$5,'Sample checkout','paid','USD',$6,$7,$8,
            '{"sample":true}'::jsonb)`,
        [clientId, amount, days(-(i % 26)), saleProducts[i % 6], `Sample Buyer ${i + 1}`,
          key, key, performanceIds["Your First Masterclass — September"]], "sales");
    }
    await ensure("SELECT id FROM sales_sources WHERE client_id=$1 AND processor=$2 LIMIT 1",
      [clientId, "Sample checkout"],
      "INSERT INTO sales_sources (client_id,processor,configured,verified) VALUES ($1,$2,false,false)",
      [clientId, "Sample checkout"], "sales_sources");

    for (const [title, spend, registrations, show, conversion, value] of [
      ["October masterclass forecast", "1800.00", 480, "42", "8", "97.00"],
      ["Five-day challenge forecast", "3200.00", 900, "38", "6.5", "197.00"],
    ]) {
      await ensure("SELECT id FROM projections WHERE client_id=$1 AND title=$2 LIMIT 1", [clientId, title],
        `INSERT INTO projections
          (client_id,title,ad_spend,expected_registrations,show_up_rate,conversion_rate,average_sale_value)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [clientId, title, spend, registrations, show, conversion, value], "projections");
    }

    for (const [title, offset, description] of [
      ["Launch planning call", 3, "Review the event promise, audience, and launch checklist."],
      ["Masterclass rehearsal", 10, "Run through slides, transitions, and attendee questions."],
      ["Next Steps Masterclass", 14, "Live educational masterclass for the sample audience."],
      ["Campaign results review", 22, "Compare registrations, attendance, and revenue against targets."],
    ]) {
      await ensure("SELECT id FROM calendar_entries WHERE client_id=$1 AND title=$2 LIMIT 1", [clientId, title],
        `INSERT INTO calendar_entries
          (client_id,title,event_date,end_date,timezone,description)
          VALUES ($1,$2,$3,$4,'America/New_York',$5)`,
        [clientId, title, days(offset), new Date(days(offset).getTime() + 3600000), description], "calendar_entries");
    }

    for (const [name, content] of [
      ["Sample brand brief.txt", "EventHQ Sample Studio\nAudience: independent creators and small teams.\nTone: clear, practical, encouraging.\nOffer: Event Growth Intensive.\nThis is fictional demo content."],
      ["Launch checklist.txt", "1. Confirm event promise and date.\n2. Publish the registration page.\n3. Schedule invitation emails.\n4. Rehearse the session.\n5. Review attendance and sales.\nThis is fictional demo content."],
    ]) {
      await ensure("SELECT id FROM vault_assets WHERE client_id=$1 AND name=$2 LIMIT 1", [clientId, name],
        "INSERT INTO vault_assets (client_id,name,file_type,content) VALUES ($1,$2,'TXT',$3)",
        [clientId, name, content], "vault_assets");
    }

    for (const [subject, body, category, age] of [
      ["Your sample launch plan is ready", "Explore the example event plan and approved assets in your workspace. This is a demo notification.", "asset_ready", -2],
      ["Welcome to your EventHQ demo", "Use the dashboard to explore sample events, sales, training, and calendar entries. Changes are disabled in this read-only demo.", "account_update", -7],
    ]) {
      const notificationId = await ensure(
        "SELECT id FROM notifications WHERE agency_id=$1 AND subject=$2 LIMIT 1", [agencyId, subject],
        "INSERT INTO notifications (agency_id,sender_user_id,subject,body,category,created_at) VALUES ($1,$2,$3,$4,$5,$6)",
        [agencyId, "demo-client:sample-admin", subject, body, category, days(age)], "notifications");
      await ensure("SELECT id FROM notification_recipients WHERE notification_id=$1 AND recipient_user_id=$2 LIMIT 1",
        [notificationId, "demo-client:sample"],
        `INSERT INTO notification_recipients
          (notification_id,client_id,recipient_user_id,recipient_email,email_status,created_at)
          VALUES ($1,$2,$3,'eventhq.client@example.com','pending',$4)`,
        [notificationId, clientId, "demo-client:sample", days(age)], "notification_recipients");
    }

    for (const [title, question, answer] of [
      ["Improving masterclass attendance",
        "How can I improve attendance for my next masterclass?",
        "Start with a clear event promise. Send reminders one day and one hour before the session, include the calendar link, and follow up with registrants who miss it. Compare your sample attendance rate with the next event."],
      ["Five-day launch priorities",
        "What should I focus on first for a five-day launch?",
        "Choose one audience and one measurable outcome. Then plan the daily sessions, registration page, invitation emails, and follow-up before creating extra content. This is a sample conversation."],
    ]) {
      const chatId = await ensure("SELECT id FROM tuck_chats WHERE client_id=$1 AND title=$2 LIMIT 1",
        [clientId, title], "INSERT INTO tuck_chats (client_id,title) VALUES ($1,$2)", [clientId, title], "tuck_chats");
      const existing = (await db.query("SELECT count(*)::int AS count FROM tuck_messages WHERE chat_id=$1", [chatId])).rows[0].count;
      if (existing === 0) {
        await db.query("INSERT INTO tuck_messages (chat_id,role,content) VALUES ($1,'user',$2),($1,'assistant',$3)",
          [chatId, question, answer]);
        counts.tuck_messages = (counts.tuck_messages || 0) + 2;
      }
    }

    for (const [name, type, eventType] of [
      ["Masterclass email sequence", "email_sequence", "webinar"],
      ["Challenge social launch posts", "social_posts", "free_challenge"],
    ]) {
      await ensure("SELECT id FROM asset_templates WHERE agency_id=$1 AND name=$2 LIMIT 1", [agencyId, name],
        `INSERT INTO asset_templates
          (agency_id,name,asset_type,event_type,item_count,system_prompt,output_format)
          VALUES ($1,$2,$3,$4,5,'Create helpful, clear sample campaign content.','markdown')`,
        [agencyId, name, type, eventType], "asset_templates");
    }

    await db.query("COMMIT");
    console.log(JSON.stringify({ demoClientId: clientId, created: counts, untouchedRealClients: true }));
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
    await pool.end();
  }
}
run().catch(error => {
  console.error("Sample data was not committed:", error.message);
  process.exitCode = 1;
});