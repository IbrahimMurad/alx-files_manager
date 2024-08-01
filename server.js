import express from 'express';
import mapRoutes from './routes';

const PORT = process.env.PORT || 5000;

const app = express();
app.use(express.json());
mapRoutes(app);
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
