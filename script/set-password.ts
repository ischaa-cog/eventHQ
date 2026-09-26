// Sets (or resets) a user's login password. Also the recovery path if the owner forgets theirs.
// Run: npx tsx --env-file=.env script/set-password.ts <email> <password>
import { storage } from "../server/storage";
import { passwordProblem } from "../server/passwords";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("Usage: npx tsx --env-file=.env script/set-password.ts <email> <password>");
  process.exit(1);
}
const problem = passwordProblem(password);
if (problem) {
  console.error(problem);
  process.exit(1);
}
const user = await storage.getUserByEmail(email);
if (!user) {
  console.error(`No user with email ${email}`);
  process.exit(1);
}
await storage.setUserPassword(user.id, password);
console.log(`Password set for ${user.email} (${user.role}).`);
process.exit(0);
