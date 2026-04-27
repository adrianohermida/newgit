import { handleRequest } from './routes';
import { CopilotConversationRoomV2 } from './copilot-room';

export default {
  fetch: handleRequest,
  CopilotConversationRoomV2,
};