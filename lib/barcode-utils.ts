export function getEAN13CheckDigit(body: string): string {
  if (!/^\d{12}$/.test(body)) {
    throw new Error('EAN-13 requires 12 numeric data digits');
  }

  const sum = Array.from(body).reduce(
    (total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3),
    0
  );
  return String((10 - (sum % 10)) % 10);
}

export function generateEAN13(): string {
  const body = `890${Array.from(
    { length: 9 },
    () => Math.floor(Math.random() * 10).toString()
  ).join('')}`;
  return body + getEAN13CheckDigit(body);
}
