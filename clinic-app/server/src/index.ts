import 'dotenv/config'; // must run before anything reads process.env
import app from './app';
import { refreshPractice } from './services/practice';

const PORT = process.env.PORT || 4000;

// Load the saved practice details (hours, phone, ...) before taking requests.
refreshPractice().finally(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
