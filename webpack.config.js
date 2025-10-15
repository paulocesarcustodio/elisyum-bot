import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  mode: 'production',
  target: 'node',
  entry: path.resolve(__dirname, 'webpack.entry.js'),
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'webpack.bundle.js',
    clean: false
  },
  infrastructureLogging: {
    level: 'error'
  },
  stats: 'minimal'
};
