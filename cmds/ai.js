const axios = require('axios');
const fs = require('fs');
const https = require('https');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// API keys for fallback
const apiKeys = [
  "AIzaSyBAEiDoFt0no4m_rvuWnAdqj8TzPPSoESs",
  "AIzaSyAgZgBukaiCxWlm-P7zo9tmOM9499BsJp4",
  "AIzaSyArWBkp8T1izTH5Gfbgk5DFfBILkwoBAnc",
  "AIzaSyDDI6Uaond8rN4o4-iDOwKeWEaqq_Srl3Q",
  "AIzaSyDOYoqSMxnoL-JtCdtOWhfaS6swm2xC7TA",
  "AIzaSyAemg5ehyhLdEQFROK9PV3jBZScsC7Onp0",
];

// Helper to rotate API keys
let currentApiKeyIndex = 0;
function getCurrentApiKey() {
  return apiKeys[currentApiKeyIndex];
}
function rotateApiKey() {
  currentApiKeyIndex = (currentApiKeyIndex + 1) % apiKeys.length;
  return getCurrentApiKey();
}

// Font mapping for bold text
const fontMapping = {
  'A': '𝗔', 'B': '𝗕', 'C': '𝗖', 'D': '𝗗', 'E': '𝗘', 'F': '𝗙', 'G': '𝗚',
  'H': '𝗛', 'I': '𝗜', 'J': '𝗝', 'K': '𝗞', 'L': '𝗟', 'M': '𝗠', 'N': '𝗡',
  'O': '𝗢', 'P': '𝗣', 'Q': '𝗤', 'R': '𝗥', 'S': '𝗦', 'T': '𝗧', 'U': '𝗨',
  'V': '𝗩', 'W': '𝗪', 'X': '𝗫', 'Y': '𝗬', 'Z': '𝗭',
  'a': '𝗮', 'b': '𝗯', 'c': '𝗰', 'd': '𝗱', 'e': '𝗲', 'f': '𝗳', 'g': '𝗴',
  'h': '𝗵', 'i': '𝗶', 'j': '𝗷', 'k': '𝗸', 'l': '𝗹', 'm': '𝗺', 'n': '𝗻',
  'o': '𝗼', 'p': '𝗽', 'q': '𝗾', 'r': '𝗿', 's': '𝘀', 't': '𝘁', 'u': '𝘂',
  'v': '𝘃', 'w': '𝘄', 'x': '𝘅', 'y': '𝘆', 'z': '𝘇'
};

function convertToBold(text) {
  return text.replace(/\*(.*?)\*/g, (match, p1) => [...p1].map(char => fontMapping[char] || char).join(''))
    .replace(/### (.*?)(\n|$)/g, (match, p1) => `${[...p1].map(char => fontMapping[char] || char).join('')}`);
}

// Retry logic with exponential backoff
async function retryWithBackoff(fn, retries = 5, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.response?.status === 429) { // Handle rate limit
        console.log(`Rate limit exceeded. Retrying in ${delay}ms...`);
        rotateApiKey(); // Use next API key
      } else if (i < retries - 1) {
        console.log(`Retrying after ${delay}ms...`);
      } else {
        throw error; // Exhaust retries
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
}

module.exports = {
  name: "ai",
  usedby: 0,
  dmUser: false,
  dev: "Jonell Magallanes",
  nickName: ["chatgpt", "gpt"],
  info: "EDUCATIONAL",
  onPrefix: false,
  cooldowns: 6,

  onReply: async function ({ reply, api, event }) {
    const { threadID, senderID } = event;
    const followUpApiUrl = `https://ccprojectapis.ddns.net/api/gptconvo?ask=${encodeURIComponent(reply)}&id=${senderID}`;
    api.setMessageReaction("⏱️", event.messageID, () => {}, true);

    try {
      const response = await retryWithBackoff(() => axios.get(followUpApiUrl));
      const followUpResult = convertToBold(response.data.response);
      api.setMessageReaction("✅", event.messageID, () => {}, true);
      api.sendMessage(`${followUpResult}\n\nQuestion asked by: ${event.senderID}`, threadID, event.messageID);
    } catch (error) {
      api.sendMessage(`Error: ${error.message}`, threadID);
    }
  },

  onLaunch: async function ({ event, actions, target, api }) {
    const { messageID, threadID } = event;
    const id = event.senderID;

    if (!target[0]) {
      return api.sendMessage("Please provide your question.\n\nExample: ai what is the solar system?", threadID, messageID);
    }

    const apiUrl = `https://ccprojectapis.ddns.net/api/gptconvo?ask=${encodeURIComponent(target.join(" "))}&id=${id}`;
    const lad = await actions.reply("🔎 Searching for an answer. Please wait...", threadID, messageID);

    try {
      const genAI = new GoogleGenerativeAI(getCurrentApiKey());
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const response = await retryWithBackoff(async () => {
        return await model.generateContent([target.join(" ")]);
      });

      const result = convertToBold(response.response.text());

      api.editMessage(`${result}\n\nQuestion asked by: ${event.senderID}`, lad.messageID, event.threadID, messageID);

      global.client.onReply.push({
        name: this.name,
        messageID: lad.messageID,
        author: event.senderID,
      });
    } catch (error) {
      api.editMessage(`❌ | ${error.message}`, lad.messageID, threadID, messageID);
    }
  }
};
