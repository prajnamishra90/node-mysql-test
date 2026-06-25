const express = require('express')
const mysql = require('mysql2/promise')

const app = express()
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

// Support both DATABASE_URL and individual DB_* env vars
function dbConfig() {
  if (process.env.DATABASE_URL) {
    const u = new URL(process.env.DATABASE_URL)
    return {
      host: u.hostname,
      port: parseInt(u.port) || 3306,
      user: u.username,
      password: u.password,
      database: u.pathname.replace('/', ''),
      family: 4,
    }
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'contacts',
    family: 4,
  }
}

let pool

async function getPool() {
  if (!pool) {
    pool = mysql.createPool({ ...dbConfig(), waitForConnections: true, connectionLimit: 5 })
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS contacts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL,
        message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
  }
  return pool
}

const HTML = (body) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Contacts</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:sans-serif;background:#f0f2f5;color:#333;padding:24px}
    h1{font-size:1.8rem;margin-bottom:24px;color:#2563eb}
    h2{font-size:1.2rem;margin-bottom:12px;color:#555}
    .card{background:#fff;border-radius:10px;padding:24px;margin-bottom:24px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
    input,textarea{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:6px;font-size:.95rem;margin-bottom:12px}
    textarea{height:80px;resize:vertical}
    button{background:#2563eb;color:#fff;border:none;padding:10px 28px;border-radius:6px;font-size:1rem;cursor:pointer}
    button:hover{background:#1d4ed8}
    table{width:100%;border-collapse:collapse}
    th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #eee;font-size:.9rem}
    th{background:#f8fafc;font-weight:600;color:#555}
    tr:last-child td{border-bottom:none}
    .empty{color:#999;font-style:italic;padding:16px 0}
    .badge{background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:99px;font-size:.8rem}
  </style>
</head>
<body>
  <h1>Contact Manager</h1>
  ${body}
</body>
</html>`

app.get('/', async (req, res) => {
  try {
    const db = await getPool()
    const [rows] = await db.execute('SELECT * FROM contacts ORDER BY created_at DESC')

    const rows_html = rows.length
      ? rows.map(r => `<tr>
          <td>${r.id}</td>
          <td>${escape(r.name)}</td>
          <td>${escape(r.email)}</td>
          <td>${escape(r.message || '')}</td>
          <td><span class="badge">${new Date(r.created_at).toLocaleDateString()}</span></td>
        </tr>`).join('')
      : `<tr><td colspan="5" class="empty">No contacts yet. Add one above.</td></tr>`

    res.send(HTML(`
      <div class="card">
        <h2>Add Contact</h2>
        <form method="POST" action="/contacts">
          <input name="name"    placeholder="Name"    required/>
          <input name="email"   placeholder="Email"   type="email" required/>
          <textarea name="message" placeholder="Message (optional)"></textarea>
          <button type="submit">Add Contact</button>
        </form>
      </div>
      <div class="card">
        <h2>All Contacts (${rows.length})</h2>
        <table>
          <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Message</th><th>Date</th></tr></thead>
          <tbody>${rows_html}</tbody>
        </table>
      </div>
    `))
  } catch (err) {
    res.status(500).send(HTML(`<div class="card"><h2>DB Error</h2><pre>${err.message}</pre></div>`))
  }
})

app.post('/contacts', async (req, res) => {
  const { name, email, message } = req.body
  if (!name || !email) return res.status(400).send('Name and email required')
  try {
    const db = await getPool()
    await db.execute('INSERT INTO contacts (name, email, message) VALUES (?, ?, ?)', [name, email, message || ''])
    res.redirect('/')
  } catch (err) {
    res.status(500).send(HTML(`<div class="card"><h2>DB Error</h2><pre>${err.message}</pre></div>`))
  }
})

app.get('/health', (req, res) => res.json({ status: 'ok' }))

function escape(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

const PORT = process.env.PORT || 3000
app.listen(PORT, '0.0.0.0', () => console.log(`Contacts app running on port ${PORT}`))
