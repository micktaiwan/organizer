import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { useAuth } from '../hooks/useAuth.js';

type Field = 'username' | 'password';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [currentField, setCurrentField] = useState<Field>('username');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { login, server } = useAuth();

  const handleSubmit = async () => {
    if (!username || !password) {
      setError('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setIsLoading(false);
    }
  };

  useInput((input, key) => {
    if (key.tab || (key.return && currentField === 'username')) {
      setCurrentField(currentField === 'username' ? 'password' : 'username');
    } else if (key.return && currentField === 'password') {
      handleSubmit();
    }
  });

  const serverHost = new URL(server).host;

  return (
    <Box flexDirection="column" padding={2}>
      <Box marginBottom={2}>
        <Text bold color="cyan">
          ╔═══════════════════════════════════╗
        </Text>
      </Box>
      <Box marginBottom={2}>
        <Text bold color="cyan">
          ║      Organizer CLI - Login        ║
        </Text>
      </Box>
      <Box marginBottom={2}>
        <Text bold color="cyan">
          ╚═══════════════════════════════════╝
        </Text>
      </Box>

      <Box marginBottom={1}>
        <Text color="gray">Server: {serverHost}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text color={currentField === 'username' ? 'cyan' : 'white'}>
          Username:{' '}
        </Text>
        <TextInput
          value={username}
          onChange={setUsername}
          focus={currentField === 'username'}
          placeholder="Enter username"
        />
      </Box>

      <Box marginBottom={1}>
        <Text color={currentField === 'password' ? 'cyan' : 'white'}>
          Password:{' '}
        </Text>
        <TextInput
          value={password}
          onChange={setPassword}
          focus={currentField === 'password'}
          mask="*"
          placeholder="Enter password"
        />
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      {isLoading ? (
        <Box>
          <Text color="yellow">Logging in...</Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text color="gray">
            Press Tab to switch fields, Enter to submit
          </Text>
        </Box>
      )}
    </Box>
  );
}
