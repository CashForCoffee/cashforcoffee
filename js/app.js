// CashForCoffee — Application Logic
document.addEventListener('DOMContentLoaded', () => {
  
  // Example dummy data initial state (Replace or sync with Supabase table)
  const initialTransactions = [
    { id: 1, date: '2026-10-01', description: 'Downtown Brew - Single Origin', category: 'Coffee', amount: -5.50 },
    { id: 2, date: '2026-10-01', description: 'Weekly Salary', category: 'Income', amount: 1250.00 },
    { id: 3, date: '2026-09-29', description: 'Local Grocery Market', category: 'Groceries', amount: -64.20 },
    { id: 4, date: '2026-09-28', description: 'Espresso Bar', category: 'Coffee', amount: -4.80 }
  ];

  // Render dummy initial data to UI
  renderTransactions(initialTransactions);
  calculateKPIs(initialTransactions);

  // Form submission handler
  const settingsForm = document.getElementById('settings-form');
  if (settingsForm) {
    settingsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const cap = document.getElementById('setting-coffee-cap').value;
      const target = document.getElementById('setting-savings-target').value;
      alert(`Preferences Saved:\nWeekly Coffee Cap: $${cap}\nSavings Target: ${target}%`);
    });
  }
});

// Render table rows dynamically
function renderTransactions(transactions) {
  const tbody = document.getElementById('transaction-rows');
  if (!tbody) return;

  tbody.innerHTML = transactions.map(item => {
    const isCoffee = item.category.toLowerCase() === 'coffee';
    const isPositive = item.amount > 0;
    const badgeClass = isCoffee ? 'badge-coffee' : 'badge-general';
    const amountClass = isPositive ? 'positive' : '';

    return `
      <tr>
        <td>${item.date}</td>
        <td><strong>${item.description}</strong></td>
        <td><span class="badge ${badgeClass}">${item.category}</span></td>
        <td class="text-right ${amountClass}">
          ${isPositive ? '+' : ''}$${Math.abs(item.amount).toFixed(2)}
        </td>
      </tr>
    `;
  }).join('');
}

// Calculate summary metric cards
function calculateKPIs(transactions) {
  let coffeeSpent = 0;
  let totalInflow = 0;
  let totalOutflow = 0;

  transactions.forEach(t => {
    if (t.amount < 0) {
      totalOutflow += Math.abs(t.amount);
      if (t.category.toLowerCase() === 'coffee') {
        coffeeSpent += Math.abs(t.amount);
      }
    } else {
      totalInflow += t.amount;
    }
  });

  const safeSpend = totalInflow - totalOutflow;
  const coffeeAllowance = 35.00 - coffeeSpent;

  const safeSpendElem = document.getElementById('val-safe-spend');
  const coffeeAllowanceElem = document.getElementById('val-coffee-allowance');
  const outflowElem = document.getElementById('val-upcoming-outflow');

  if (safeSpendElem) safeSpendElem.textContent = `$${safeSpend.toFixed(2)}`;
  if (coffeeAllowanceElem) coffeeAllowanceElem.textContent = `$${coffeeAllowance.toFixed(2)}`;
  if (outflowElem) outflowElem.textContent = `$${totalOutflow.toFixed(2)}`;
}