export function money(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function odds(n: number): string {
  return n.toFixed(2) + "×";
}
