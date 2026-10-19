import { safeFetch } from './src/utils/Sanitizer.js';
async function test() {
  const apiKey = "SECRET_API_KEY_12345";
  try {
    await safeFetch(`http://nonexistent1234567.com/api`, { headers: new Headers({ 'Authorization': `Bearer ${apiKey}` }) });
  } catch (err) {
    console.log("Original Message:", err.message);
    const sanitizedStack = err.stack ? err.stack.replace(new RegExp(apiKey, 'g'), '***') : '';
    console.log("Sanitized stack:", sanitizedStack);
  }
}
test();
