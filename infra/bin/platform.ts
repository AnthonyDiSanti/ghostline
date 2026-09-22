import { getDeployment } from '../lib/config.js';
import { buildPlatformRepository } from '../lib/platform-image.js';

buildPlatformRepository(getDeployment(process.env.GHOSTLINE_DEPLOYMENT));
