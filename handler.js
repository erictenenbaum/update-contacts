const { DocumentClient } = require("aws-sdk/clients/dynamodb");

const documentClient = new DocumentClient({
  region: process.env.region || "localhost",
  endpoint: process.env.endpoint || "http://localhost:8000",
});

exports.handler = async function (event, context) {
  if (!event.body) {
    return error(["Missing Event Body"]);
  }

  const payload = JSON.parse(event.body);
  const errorMessages = validatePayload(payload);

  if (errorMessages.length) {
    return error(errorMessages);
  }

  try {
    //   check if email exists:
    if (await emailExists(payload.email, payload.contactId)) {
      return error(["Email already exists"]);
    }

    // PUT Item:
    await updateContact(payload);
    return success(payload);
  } catch (e) {
    console.log("Error: ", e);
    return error(["Internal Server Error"], 500);
  }
};

// data validation:
function validatePayload(updateEvent) {
  const requiredFields = ["contactId", "firstName", "email", "phone"];
  const optionalFields = [
    "lastName",
    "address",
    "jobTitle",
    "appId",
    "companies",
    "groups",
    "dob",
    "importSource",
  ];
  const payloadKeys = Object.keys(updateEvent);

  return [
    ...validateKeys(payloadKeys, requiredFields, optionalFields),
    ...validateFields(payloadKeys, updateEvent),
  ];
}

function validateKeys(payloadKeys, requiredFields, optionalFields) {
  const missingRequiredFields = requiredFields
    .filter((requiredFields) => !payloadKeys.includes(requiredFields))
    .map((field) => `Missing ${field} in body`);

  const invalidOptionalFields = payloadKeys
    .filter((key) => ![...requiredFields, ...optionalFields].includes(key))
    .map((key) => `Invalid Key: ${key}`);

  return [...missingRequiredFields, ...invalidOptionalFields];
}

function validateFields(payloadKeys, updateEvent) {
  const errors = [];
  const stringFields = [
    "jobTitle",
    "companies",
    "groups",
    "dob",
    "importSource",
  ];
  for (key of payloadKeys) {
    if (
      key === "email" &&
      !/^[\w\.\-_]+@[\w\-]+\.[\w]{2,3}$|^$/.test(updateEvent[key])
    ) {
      errors.push(`${updateEvent[key]} is not a valid input for email`);
    }

    if (
      key === "phone" &&
      !updateEvent[key].every((phone) => /^[0-9]+$/.test(phone.number))
    ) {
      errors.push("phone number must be at least 11 characters");
    }

    if (key === "firstName" || key === "lastName") {
      errors.push(...validateNames(updateEvent[key]));
    }

    if (stringFields.includes(key) && typeof updateEvent[key] !== "string") {
      errors.push(`${key} is not a string`);
    }

    if (key === "appId" && !/^[a-zA-Z0-9-_]{21}$/.test(updateEvent[key])) {
      errors.push("Invalid App Id");
    }
  }

  return errors;
}

function validateNames(stringField) {
  const errors = [];
  if (!/^[a-zA-Z]+/.test(stringField) || stringField === "") {
    errors.push(`Invalid Field: ${stringField}`);
  }
  return errors;
}

// responses:
function success(data, statusCode) {
  return {
    statusCode: statusCode || 200,
    body: JSON.stringify(data),
  };
}

function error(errorMessages, statusCode) {
  const response = {
    errors: errorMessages,
  };

  return {
    statusCode: statusCode || 400,
    body: JSON.stringify(response),
  };
}

//   DAO:
async function emailExists(email, contactId) {
  const params = {
    TableName: "Contacts",
    IndexName: "email-index",
    KeyConditionExpression: "email = :email",
    ExpressionAttributeValues: {
      ":email": email,
    },
  };
  const items = await documentClient.query(params).promise();

  return items?.Items.some(
    (item) => item.email === email && item.contactId !== contactId
  );
}

async function updateContact(payload) {
  const params = {
    TableName: "Contacts",
    Item: payload,
  };

  return await documentClient.put(params).promise();
}
