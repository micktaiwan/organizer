export interface AskRequest {
  question: string;
}

export interface AskResponse {
  response: string;
  mood?: 'happy' | 'curious' | 'sleepy' | 'excited';
}
