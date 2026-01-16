export type Expression = 'neutral' | 'happy' | 'laughing' | 'surprised' | 'sad' | 'sleepy' | 'curious';

export interface AskRequest {
  question: string;
}

export interface AskResponse {
  response: string;
  expression: Expression;
}
