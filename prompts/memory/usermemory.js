const users = {};

function getUser(phone) {
  if (!users[phone]) {
    users[phone] = {
      name: null,
      age: null,
      branch: null,
      phone: null,
      goal: null,
    };
  }

  return users[phone];
}

function saveUser(phone, data) {
  users[phone] = {
    ...getUser(phone),
    ...data,
  };

  return users[phone];
}

function clearUser(phone) {
  delete users[phone];
}

module.exports = {
  getUser,
  saveUser,
  clearUser,
};