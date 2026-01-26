import { useCallback } from 'react';
import { Command } from '@tauri-apps/plugin-shell';

interface UseDiagnosticParams {
  useLocalServer: boolean;
  serverUrl: string;
  ekoAuthToken: string | null;
  getAuthHeaders: () => Record<string, string>;
  addSystemMessage: (content: string) => void;
}

export function useDiagnostic({
  useLocalServer,
  serverUrl,
  ekoAuthToken,
  getAuthHeaders,
  addSystemMessage,
}: UseDiagnosticParams) {
  const runDiagnostic = useCallback(async () => {
    const mode = useLocalServer ? 'LOCAL' : 'PROD';
    addSystemMessage('Getting infos...');
    const results: string[] = [`=== DIAGNOSTIC (${mode}) ===`];

    if (useLocalServer) {
      // === LOCAL MODE CHECKS ===

      // 1. Check Docker
      try {
        const dockerCmd = Command.create('exec-sh', ['-c', 'docker --version']);
        const dockerOutput = await dockerCmd.execute();
        if (dockerOutput.code === 0) {
          results.push(`✓ Docker: ${dockerOutput.stdout.trim()}`);
        } else {
          results.push('✗ Docker: Non installé ou pas dans PATH');
        }
      } catch {
        results.push('✗ Docker: Non accessible');
      }

      // 2. Check Docker containers
      try {
        const dockerPsCmd = Command.create('exec-sh', ['-c', 'docker ps --format "{{.Names}}: {{.Status}}" 2>/dev/null']);
        const dockerPsOutput = await dockerPsCmd.execute();
        if (dockerPsOutput.code === 0 && dockerPsOutput.stdout.trim()) {
          results.push('✓ Docker containers:');
          dockerPsOutput.stdout.trim().split('\n').forEach(line => {
            results.push(`  - ${line}`);
          });
        } else {
          results.push('⚠ Docker: Aucun container actif');
        }
      } catch {
        results.push('✗ Docker: Impossible de lister les containers');
      }

      // 3. Check Qdrant local
      try {
        const qdrantRes = await fetch('http://localhost:6333/collections', { signal: AbortSignal.timeout(2000) });
        if (qdrantRes.ok) {
          const data = await qdrantRes.json();
          const collections = data.result?.collections?.map((c: { name: string }) => c.name) || [];
          results.push(`✓ Qdrant local: ${collections.length} collections`);
          if (collections.includes('organizer_memory')) {
            results.push('  ✓ Collection organizer_memory existe');
          } else {
            results.push('  ⚠ Collection organizer_memory manquante');
          }
        } else {
          results.push(`✗ Qdrant local: HTTP ${qdrantRes.status}`);
        }
      } catch {
        results.push('✗ Qdrant local: Non accessible sur localhost:6333');
      }

      // 4. Check MongoDB local
      try {
        const mongoCmd = Command.create('exec-sh', ['-c', 'mongosh mongodb://localhost:27017/organizer --quiet --eval "db.users.countDocuments()"']);
        const mongoOutput = await mongoCmd.execute();
        if (mongoOutput.code === 0) {
          const count = mongoOutput.stdout.trim();
          results.push(`✓ MongoDB local: ${count} user(s)`);
        } else {
          results.push('✗ MongoDB local: Erreur de connexion');
        }
      } catch {
        results.push('✗ MongoDB local: Non accessible');
      }

      // 5. Check local server
      try {
        const serverRes = await fetch('http://localhost:3001/health', { signal: AbortSignal.timeout(2000) });
        if (serverRes.ok) {
          results.push('✓ Server local: Running sur :3001');

          // Check auth bypass
          const testAuthRes = await fetch('http://localhost:3001/agent/memory/info', { signal: AbortSignal.timeout(2000) });
          if (testAuthRes.ok) {
            results.push('  ✓ DEV_SKIP_AUTH: Fonctionne');
          } else if (testAuthRes.status === 401) {
            results.push('  ✗ DEV_SKIP_AUTH: Auth requise (vérifier .env et restart server)');
          } else if (testAuthRes.status === 500) {
            results.push('  ✗ DEV_SKIP_AUTH: Erreur serveur interne (voir logs)');
          } else {
            results.push(`  ⚠ Test auth: HTTP ${testAuthRes.status} (voir logs serveur)`);
          }
        } else {
          results.push(`✗ Server local: HTTP ${serverRes.status}`);
        }
      } catch {
        results.push('✗ Server local: Non accessible sur :3001');
      }

      // 6. Check .env file
      try {
        const envCmd = Command.create('exec-sh', ['-c', 'cat /Users/mickaelfm/projects/perso/organizer/server/.env 2>/dev/null | grep -v "^#" | grep -v "^$"']);
        const envOutput = await envCmd.execute();
        if (envOutput.code === 0 && envOutput.stdout.trim()) {
          results.push('✓ server/.env:');
          envOutput.stdout.trim().split('\n').forEach(line => {
            const [key] = line.split('=');
            if (key?.includes('SECRET') || key?.includes('KEY')) {
              results.push(`  - ${key}=***`);
            } else {
              results.push(`  - ${line}`);
            }
          });
        } else {
          results.push('✗ server/.env: Fichier manquant ou vide');
        }
      } catch {
        results.push('✗ server/.env: Impossible de lire');
      }

    } else {
      // === PROD MODE CHECKS ===

      // 1. Check prod server + detailed health
      try {
        const healthRes = await fetch(`${serverUrl}/health/detailed`, { signal: AbortSignal.timeout(5000) });
        if (healthRes.ok) {
          const health = await healthRes.json();
          results.push(`✓ Server prod: ${serverUrl}`);

          // Qdrant status
          if (health.qdrant?.status === 'ok') {
            results.push(`✓ Qdrant: ${health.qdrant.points} mémoires (${health.qdrant.vector_size}d ${health.qdrant.distance})`);
          } else {
            results.push(`✗ Qdrant: ${health.qdrant?.error || 'Non accessible'}`);
          }

          // MongoDB status
          if (health.mongodb?.status === 'ok') {
            results.push(`✓ MongoDB: ${health.mongodb.users} user(s), ${health.mongodb.rooms} room(s)`);
          } else {
            results.push(`✗ MongoDB: ${health.mongodb?.error || 'Non accessible'}`);
          }
        } else {
          results.push(`✗ Server prod: HTTP ${healthRes.status}`);
        }
      } catch {
        results.push(`✗ Server prod: Non accessible (${serverUrl})`);
      }

      // 2. Check auth with token
      if (ekoAuthToken) {
        results.push('✓ Token Eko: Présent');
        try {
          const testAuthRes = await fetch(`${serverUrl}/agent/memory/info`, {
            headers: getAuthHeaders(),
            signal: AbortSignal.timeout(5000)
          });
          if (testAuthRes.ok) {
            results.push('  ✓ Auth: Token valide');
          } else if (testAuthRes.status === 401) {
            results.push('  ✗ Auth: Token invalide ou expiré');
          } else {
            results.push(`  ⚠ Auth: HTTP ${testAuthRes.status}`);
          }
        } catch {
          results.push('  ✗ Auth: Erreur réseau');
        }
      } else {
        results.push('✗ Token Eko: Absent (login requis)');
      }

      // 3. Check agent endpoint (lightweight health check, no LLM call)
      try {
        const agentRes = await fetch(`${serverUrl}/agent/health`, {
          headers: getAuthHeaders(),
          signal: AbortSignal.timeout(5000)
        });
        if (agentRes.ok) {
          results.push('✓ Agent worker: Actif');
        } else {
          const data = await agentRes.json().catch(() => ({}));
          results.push(`⚠ Agent worker: ${data.error || `HTTP ${agentRes.status}`}`);
        }
      } catch {
        results.push('✗ Agent worker: Non accessible ou timeout');
      }
    }

    results.push(`=== FIN DIAGNOSTIC ===`);
    addSystemMessage(results.join('\n'));
  }, [useLocalServer, serverUrl, ekoAuthToken, getAuthHeaders, addSystemMessage]);

  return { runDiagnostic };
}
