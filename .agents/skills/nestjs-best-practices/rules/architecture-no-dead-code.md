---
title: Remove Unused Code and Dependencies
impact: MEDIUM
section: 3
impactDescription: Reduces bundle size and maintenance burden
tags: code-quality, cleanup, dead-code, dependencies
---

## Remove Unused Code and Dependencies

Dead code bloats the project and confuses developers. Unused dependencies increase attack surface. Regular cleanup keeps codebase lean. **No unused imports, functions, or packages.**

**Incorrect (code rot):**

```typescript
// users.service.ts - Dead weight 🚨
import * as argon2 from 'argon2';  // Unused
import { SomeOtherService } from './other.service';  // Unused

@Injectable()
export class UsersService {
  unusedFunction() {  // Never called
    return 'unused';
  }
  
  async createUser(data: any) {
    return this.prisma.user.create({ data });  // argon2 never used
  }
}
```

```json
// package.json - Unused deps
{
  "dependencies": {
    "lodash": "^4.17.20",     // Never imported
    "moment": "^2.29.4",      // Replaced by date-fns
    "axios": "^1.0.0"         // Switched to fetch
  }
}
```

**Correct (clean codebase):**

```bash
# Remove dead code
pnpm lint -- --fix      # eslint --fix
pnpm exec depcheck      # Find unused deps

# Tools
pnpm dlx depcheck                       # Unused packages
pnpm dlx ts-unused-exports tsconfig.json  # Unused exports
```

```json
// package.json - Clean ✅
{
  "scripts": {
    "cleanup": "pnpm store prune && pnpm lint:fix",
    "depcheck": "depcheck && ts-unused-exports tsconfig.json"
  }
}
```