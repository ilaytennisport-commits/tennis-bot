const conversations = new Map();

const MAX_MESSAGES = 12;

function getConversation(userId) {
  return conversations.get(userId) || [];
}

function addMessage(userId, role, content) {
  if (!userId || !content) {
    return;
  }

  const history = getConversation(userId);

  history.push({
    role,
    content,
  });

  // שומרים רק את ההודעות האחרונות כדי לא להעמיס
  const trimmedHistory = history.slice(-MAX_MESSAGES);

  conversations.set(userId, trimmedHistory);
}

function clearConversation(userId) {
  conversations.delete(userId);
}

module.exports = {
  getConversation,
  addMessage,
  clearConversation,
};