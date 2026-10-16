# Smart Expense Tracker

## Description

Smart Expense Tracker is a simple, responsive web app that helps you record your income and expenses, see your current balance, and understand where your money goes. All data is stored in your browser using `localStorage`, so it stays after you refresh the page. No server, database or internet connection is needed.

## Features

- Dashboard with **Total Income**, **Total Expenses** and **Current Balance** (calculated automatically)
- Add transactions with description, amount, type (income/expense), category and date
- Form validation (empty fields, zero, negative or invalid amounts are rejected)
- Transaction list with a **Delete** button for each entry
- **Search** by description or category, plus filters by type and category
- **Expense categories** breakdown with amounts, percentages and progress bars
- **Clear All** button with a confirmation prompt
- Friendly messages when there are no transactions or no search results
- Data saved in `localStorage` (persists after refresh)
- Responsive design for desktop, tablet and mobile

## Technologies Used

- HTML5
- CSS3 (Flexbox, Grid, media queries)
- Vanilla JavaScript (ES5-style, no libraries or frameworks)
- Browser `localStorage`

## How to Run

1. Download or copy the project folder.
2. Make sure `index.html`, `style.css` and `script.js` are in the same folder.
3. Double-click `index.html` to open it in any modern browser (Chrome, Edge, Firefox, Safari).

No installation or build step is required.

## Project Structure

```
smart-expense-tracker/
├── index.html   # Page structure
├── style.css    # Styling and responsive layout
├── script.js    # App logic and localStorage
└── README.md    # Project documentation
```

## Future Enhancements

- Edit existing transactions
- Charts (pie/bar) for spending visualization
- Filter by date range or month
- Export/import data as CSV or JSON
- Custom categories and currency selection
- Monthly budget limits with alerts
- Dark mode
