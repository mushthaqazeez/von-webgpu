import fs from "fs";
import path from "path";

const targetDir = "D:/how-mentat-works";

const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mentat Interactive Lab — How It Works</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: rgba(18, 24, 40, 0.85);
      --border: rgba(255, 255, 255, 0.1);
      --amber: #f59e0b;
      --cyan: #06b6d4;
      --green: #10b981;
      --red: #ef4444;
      --text: #f8fafc;
      --muted: #94a3b8;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Plus Jakarta Sans', sans-serif;
      padding: 32px 20px;
      line-height: 1.5;
    }

    .container { max-width: 1200px; margin: 0 auto; }

    header {
      text-align: center;
      margin-bottom: 36px;
    }

    h1 {
      font-size: 2.2rem;
      font-weight: 800;
      color: #fff;
      margin-bottom: 8px;
    }

    h1 span { color: var(--amber); }

    .subtitle {
      font-size: 1.05rem;
      color: var(--muted);
      max-width: 700px;
      margin: 0 auto;
    }

    .comparison-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 28px;
      margin-bottom: 40px;
    }

    @media (min-width: 900px) {
      .comparison-grid { grid-template-columns: 1fr 1fr; }
    }

    .panel {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 24px;
      display: flex;
      flex-direction: column;
    }

    .panel.success { border-color: rgba(16, 185, 129, 0.4); }
    .panel.lesson { border-color: rgba(245, 158, 11, 0.4); }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }

    .panel-title {
      font-weight: 700;
      font-size: 1.15rem;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 999px;
    }

    .badge.green { background: rgba(16, 185, 129, 0.2); color: var(--green); border: 1px solid var(--green); }
    .badge.amber { background: rgba(245, 158, 11, 0.2); color: var(--amber); border: 1px solid var(--amber); }

    .prompt-box {
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.85rem;
      margin-bottom: 16px;
      color: #cbd5e1;
    }

    .prompt-box strong { color: #fff; }

    /* Mock Kite Form */
    .mock-kite {
      background: #fff;
      color: #1e293b;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
      text-align: center;
    }

    .kite-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #fed7aa;
      color: #ea580c;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 10px;
    }

    .kite-userid { font-weight: 700; font-size: 1.1rem; }
    .kite-link { font-size: 0.8rem; color: #3b82f6; text-decoration: none; display: block; margin-bottom: 14px; }
    .kite-input { width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; margin-bottom: 14px; }
    .kite-btn {
      width: 100%;
      background: #ff5722;
      color: #fff;
      border: none;
      padding: 10px;
      border-radius: 6px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }

    /* Mock Gmail Table */
    .mock-gmail {
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 16px;
      font-size: 0.85rem;
    }

    .email-row {
      display: flex;
      align-items: center;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      transition: all 0.3s ease;
    }

    .email-sender { width: 140px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .email-subject { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #cbd5e1; }
    .email-tag { font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; margin-left: 8px; }

    .email-row.flagged-spam {
      background: rgba(245, 158, 11, 0.15) !important;
      border-left: 4px solid var(--amber);
    }

    .btn-action {
      background: linear-gradient(135deg, var(--amber) 0%, #d97706 100%);
      color: #0f172a;
      border: none;
      border-radius: 10px;
      padding: 10px 16px;
      font-weight: 700;
      cursor: pointer;
      width: 100%;
      margin-top: auto;
    }

    .explanation-card {
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      font-size: 0.88rem;
      margin-top: 14px;
    }

    .explanation-card h4 { color: #fff; margin-bottom: 6px; }
  </style>
</head>
<body>

  <div class="container">
    <header>
      <h1>Mentat <span>Interactive Lab</span></h1>
      <p class="subtitle">
        Comparing <strong>Tier 1 Motor Action</strong> (Zerodha Kite) vs <strong>Tier 2 Batch Sensory Mutation</strong> (Gmail).
      </p>
    </header>

    <div class="comparison-grid">
      <!-- Panel 1: Zerodha Kite -->
      <div class="panel success">
        <div class="panel-header">
          <div class="panel-title">✅ Zerodha Kite Page</div>
          <span class="badge green">Tier 1: Motor Action</span>
        </div>

        <div class="prompt-box">
          User Command: <strong>"login"</strong><br>
          Action Type: <strong>Click single element</strong>
        </div>

        <div class="mock-kite">
          <div class="kite-avatar">AK</div>
          <div class="kite-userid">PK4198</div>
          <a class="kite-link" href="#">Change user</a>
          <input class="kite-input" type="password" value="••••••••••••" readonly />
          <button class="kite-btn" id="kite-demo-btn">Login</button>
        </div>

        <button class="btn-action" id="btn-simulate-kite">
          Run Mentat on Kite (~5ms)
        </button>

        <div class="explanation-card">
          <h4>Why this worked:</h4>
          <p>The page had an explicit, visible button labelled <strong>"Login"</strong>. Mentat's <code>resolveChoice()</code> ranked it #1 with 99.4% confidence and fired a simulated mouse click immediately.</p>
        </div>
      </div>

      <!-- Panel 2: Gmail -->
      <div class="panel lesson">
        <div class="panel-header">
          <div class="panel-title">💡 Gmail Inbox Page</div>
          <span class="badge amber">Tier 2: Batch Classification</span>
        </div>

        <div class="prompt-box">
          User Command: <strong>"colour non importatn mails or spam like mails"</strong><br>
          Action Type: <strong>Batch evaluate 50 items & mutate CSS</strong>
        </div>

        <div class="mock-gmail" id="gmail-table">
          <div class="email-row" data-spam="true">
            <span class="email-sender">LinkedIn Job Alerts</span>
            <span class="email-subject">Automation Engineer job at Aptiv - Actively recruiting</span>
          </div>
          <div class="email-row" data-spam="false">
            <span class="email-sender" style="color: #60a5fa;">Google Security</span>
            <span class="email-subject">Security alert - New sign-in to your account</span>
          </div>
          <div class="email-row" data-spam="true">
            <span class="email-sender">NaukriGulf</span>
            <span class="email-subject">Top 15 jobs for you today - Assistant Manager Workforce</span>
          </div>
          <div class="email-row" data-spam="false">
            <span class="email-sender" style="color: #60a5fa;">Google</span>
            <span class="email-subject">Google Verification Code: 492019</span>
          </div>
          <div class="email-row" data-spam="true">
            <span class="email-sender">LessWrong</span>
            <span class="email-subject">[LessWrong] What the ozone hole teaches us about AI...</span>
          </div>
          <div class="email-row" data-spam="false">
            <span class="email-sender" style="color: #10b981;">BSE ALERTS</span>
            <span class="email-subject">Funds / Securities Balance - Dear Investor, With reference to BSE...</span>
          </div>
        </div>

        <button class="btn-action" id="btn-simulate-gmail">
          Run Tier 2 Batch Color Engine (25ms)
        </button>

        <div class="explanation-card">
          <h4>Why your first try gave "Ambiguous":</h4>
          <p>There is <strong>no button</strong> in Gmail that colors emails! Mentat was searching for a button to click. To color emails, Mentat needs to run <strong>Batch Classification</strong> (evaluating all email subjects in 25ms and painting matching rows).</p>
        </div>
      </div>
    </div>
  </div>

  <script>
    // Simulate Kite
    document.getElementById('btn-simulate-kite').addEventListener('click', () => {
      const btn = document.getElementById('kite-demo-btn');
      btn.style.outline = '3px solid #06b6d4';
      btn.style.transform = 'scale(0.96)';
      setTimeout(() => {
        btn.style.background = '#10b981';
        btn.innerText = '✓ Logged In (5ms)';
        btn.style.outline = 'none';
        btn.style.transform = 'scale(1)';
      }, 300);
    });

    // Simulate Gmail Batch Coloring
    document.getElementById('btn-simulate-gmail').addEventListener('click', () => {
      const rows = document.querySelectorAll('.email-row');
      rows.forEach(row => {
        const isSpam = row.getAttribute('data-spam') === 'true';
        if (isSpam) {
          row.classList.add('flagged-spam');
          if (!row.querySelector('.email-tag')) {
            const tag = document.createElement('span');
            tag.className = 'email-tag';
            tag.style.background = 'rgba(245, 158, 11, 0.2)';
            tag.style.color = '#f59e0b';
            tag.innerText = 'P(Promo)=0.94';
            row.appendChild(tag);
          }
        } else {
          row.style.opacity = '0.9';
          if (!row.querySelector('.email-tag')) {
            const tag = document.createElement('span');
            tag.className = 'email-tag';
            tag.style.background = 'rgba(16, 185, 129, 0.2)';
            tag.style.color = '#10b981';
            tag.innerText = 'P(Important)=0.99';
            row.appendChild(tag);
          }
        }
      });
    });
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(targetDir, "index.html"), htmlContent);
console.log("[✓] Created D:/how-mentat-works/index.html");
