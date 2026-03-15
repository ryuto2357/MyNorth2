import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export async function chat(messages: Array<{ role: string; content: string }>, systemPrompt: string) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    systemInstruction: systemPrompt,
  })

  // Convert messages to Gemini format
  const history = messages.slice(0, -1).map((msg) => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }],
  }))

  const lastMessage = messages[messages.length - 1]

  const chatSession = model.startChat({ history })
  const result = await chatSession.sendMessage(lastMessage.content)
  const responseText = result.response.text()

  return responseText
}

export async function* streamChat(
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string
) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    systemInstruction: systemPrompt,
  })

  const history = messages.slice(0, -1).map((msg) => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }],
  }))

  const lastMessage = messages[messages.length - 1]

  const chatSession = model.startChat({ history })
  const stream = await chatSession.sendMessageStream(lastMessage.content)

  for await (const chunk of stream.stream) {
    yield chunk.text()
  }
}
