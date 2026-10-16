
require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const path = require("path");
const pool = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false }));

app.use(
  session({
    name: "expense.sid",
    secret: process.env.SESSION_SECRET || "local-development-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 24 * 60 * 60 * 1000
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Please log in first." });
  }
  next();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validDate(date) {
  if (typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date;
}

function validateTransaction(body) {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const category = typeof body.category === "string"
    ? body.category.trim()
    : "";
  const amount = Number(body.amount);
  const type = body.transaction_type;
  const date = body.expense_date;
  const payment = typeof body.payment_method === "string"
    ? body.payment_method.trim()
    : "Other";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";

  if (!title || title.length > 150) {
    return { error: "Enter a title of up to 150 characters." };
  }

  if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999) {
    return { error: "Enter a valid amount greater than zero." };
  }

  if (!category || category.length > 80) {
    return { error: "Select a valid category." };
  }

  if (!["income", "expense"].includes(type)) {
    return { error: "Transaction type must be income or expense." };
  }

  if (!validDate(date)) {
    return { error: "Enter a valid transaction date." };
  }

  if (payment.length > 50 || notes.length > 5000) {
    return { error: "Payment method or notes are too long." };
  }

  return {
    data: {
      title,
      amount: amount.toFixed(2),
      category,
      transaction_type: type,
      payment_method: payment || "Other",
      expense_date: date,
      notes
    }
  };
}

function safeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
}

// Register a new user
app.post("/api/register", async (req, res) => {
  try {
    const name = typeof req.body.name === "string"
      ? req.body.name.trim()
      : "";
    const email = typeof req.body.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
    const password = typeof req.body.password === "string"
      ? req.body.password
      : "";

    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({
        message: "Name must contain 2 to 100 characters."
      });
    }

    if (!validEmail(email) || email.length > 255) {
      return res.status(400).json({ message: "Enter a valid email." });
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        message: "Password must contain 8 to 72 characters."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await pool.execute(
      "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
      [name, email, passwordHash]
    );

    req.session.userId = result.insertId;

    req.session.save((err) => {
      if (err) {
        return res.status(500).json({
          message: "Account created, but session setup failed. Please log in."
        });
      }

      res.status(201).json({
        message: "Account created successfully.",
        user: { id: result.insertId, name, email }
      });
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        message: "An account with this email already exists."
      });
    }

    console.error("Registration error:", err.message);
    res.status(500).json({ message: "Could not create account." });
  }
});

// Log in
app.post("/api/login", async (req, res) => {
  try {
    const email = typeof req.body.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
    const password = typeof req.body.password === "string"
      ? req.body.password
      : "";

    if (!validEmail(email) || !password) {
      return res.status(400).json({
        message: "Enter your email and password."
      });
    }

    const [rows] = await pool.execute(
      "SELECT id, name, email, password_hash FROM users WHERE email = ?",
      [email]
    );

    if (!rows.length ||
        !(await bcrypt.compare(password, rows[0].password_hash))) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({ message: "Could not start session." });
      }

      req.session.userId = rows[0].id;

      req.session.save((saveErr) => {
        if (saveErr) {
          return res.status(500).json({ message: "Could not save session." });
        }

        res.json({
          message: "Login successful.",
          user: safeUser(rows[0])
        });
      });
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ message: "Could not log in." });
  }
});

// Log out
app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: "Could not log out." });
    }

    res.clearCookie("expense.sid", {
      httpOnly: true,
      sameSite: "lax",
      secure: false
    });

    res.json({ message: "Logged out successfully." });
  });
});

// Get current user
app.get("/api/me", async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not logged in." });
    }

    const [rows] = await pool.execute(
      "SELECT id, name, email FROM users WHERE id = ?",
      [req.session.userId]
    );

    if (!rows.length) {
      return res.status(401).json({ message: "Account not found." });
    }

    res.json({ user: safeUser(rows[0]) });
  } catch (err) {
    console.error("User lookup error:", err.message);
    res.status(500).json({ message: "Could not load account." });
  }
});

// Get transactions, optionally filtered by date
app.get("/api/expenses", requireLogin, async (req, res) => {
  try {
    const { from, to, type, category } = req.query;
    const conditions = ["user_id = ?"];
    const values = [req.session.userId];

    if (from) {
      if (!validDate(from)) {
        return res.status(400).json({ message: "Invalid start date." });
      }
      conditions.push("expense_date >= ?");
      values.push(from);
    }

    if (to) {
      if (!validDate(to)) {
        return res.status(400).json({ message: "Invalid end date." });
      }
      conditions.push("expense_date <= ?");
      values.push(to);
    }

    if (from && to && from > to) {
      return res.status(400).json({
        message: "Start date must not be after end date."
      });
    }

    if (type && ["income", "expense"].includes(type)) {
      conditions.push("transaction_type = ?");
      values.push(type);
    }

    if (category && category !== "All") {
      conditions.push("category = ?");
      values.push(String(category).slice(0, 80));
    }

    const [rows] = await pool.execute(
      `SELECT id, title, amount, category, transaction_type,
              payment_method, expense_date, notes, created_at
       FROM expenses
       WHERE ${conditions.join(" AND ")}
       ORDER BY expense_date DESC, id DESC`,
      values
    );

    res.json({ expenses: rows });
  } catch (err) {
    console.error("Transaction list error:", err.message);
    res.status(500).json({ message: "Could not load transactions." });
  }
});

// Add a transaction
app.post("/api/expenses", requireLogin, async (req, res) => {
  try {
    const validation = validateTransaction(req.body);

    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const t = validation.data;

    const [result] = await pool.execute(
      `INSERT INTO expenses
       (user_id, title, amount, category, transaction_type,
        payment_method, expense_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.session.userId,
        t.title,
        t.amount,
        t.category,
        t.transaction_type,
        t.payment_method,
        t.expense_date,
        t.notes
      ]
    );

    res.status(201).json({
      message: "Transaction added successfully.",
      id: result.insertId
    });
  } catch (err) {
    console.error("Add transaction error:", err.message);
    res.status(500).json({ message: "Could not add transaction." });
  }
});

// Update a transaction
app.put("/api/expenses/:id", requireLogin, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid transaction ID." });
    }

    const validation = validateTransaction(req.body);

    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const t = validation.data;

    const [result] = await pool.execute(
      `UPDATE expenses
       SET title = ?, amount = ?, category = ?, transaction_type = ?,
           payment_method = ?, expense_date = ?, notes = ?
       WHERE id = ? AND user_id = ?`,
      [
        t.title,
        t.amount,
        t.category,
        t.transaction_type,
        t.payment_method,
        t.expense_date,
        t.notes,
        id,
        req.session.userId
      ]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        message: "Transaction not found."
      });
    }

    res.json({ message: "Transaction updated successfully." });
  } catch (err) {
    console.error("Update transaction error:", err.message);
    res.status(500).json({ message: "Could not update transaction." });
  }
});

// Delete a transaction
app.delete("/api/expenses/:id", requireLogin, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid transaction ID." });
    }

    const [result] = await pool.execute(
      "DELETE FROM expenses WHERE id = ? AND user_id = ?",
      [id, req.session.userId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        message: "Transaction not found."
      });
    }

    res.json({ message: "Transaction deleted successfully." });
  } catch (err) {
    console.error("Delete transaction error:", err.message);
    res.status(500).json({ message: "Could not delete transaction." });
  }
});

// Send the app's main page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Test database connection before starting
async function startServer() {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();

    app.listen(PORT, () => {
      console.log(`Smart Expense Tracker running at http://localhost:${PORT}`);
      console.log("MySQL connected successfully.");
    });
  } catch (err) {
    console.error("Unable to connect to MySQL:", err.message);
    console.error("Check MySQL service, database, username and .env password.");
    process.exit(1);
  }
}

startServer();
