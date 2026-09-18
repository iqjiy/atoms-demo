import { createInMemoryRepos } from '../../server/db/repositories/memory.js';
import { repositoryContract } from './repositoryContract.js';

// 内存实现跑契约（单测，离线、快速）
repositoryContract(createInMemoryRepos);
