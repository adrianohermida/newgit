var jwt = require('jsonwebtoken');
var request = require('request');

function searchAccountsByContact(contactId) {
  var jwt_token = jwt.sign({ foo: 'bar' }, 'secret', { expiresIn: '1h' });
  var options = {
    url: `https://hmadv-7b725ea101eff55.freshsales.io/api/search?q=${contactId}&include=sales_account&per_page=2`,
    method: "GET",
    headers: {
      'Authorization': `Bearer ${jwt_token}`
    }
  };
  request(options, function(error, response, body) {
    if (error) {
      console.error('Error fetching accounts:', error);
    } else {
      console.log(body);
    }
  });
}

searchAccountsByContact('<contact_id>');