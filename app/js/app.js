// Shared UI state plus hooks that main.js fills in, so views and actions can ask for a re-render or a toast without import cycles.
export const ui = { tab: "payday", month: null, half: 1, payoff: "avalanche", connecting: false };
export const app = { render: () => {}, toast: () => {} };
