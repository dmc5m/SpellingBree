import { NextRequest, NextResponse } from "next/server"
import { AzureOpenAI } from "openai"

const SYSTEM_PROMPT =
  "You are a third-grade spelling teacher. The user is your student. " +
  "Give short spoken-style gentle hints and theory about the spelling. " +
  "Do not give the answer or hints that make the answer obvious. " +
  "Add some third grade humor if possible."

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

export async function POST(request: NextRequest) {
  const { misspelling, correct } = await request.json()

  if (!misspelling || !correct) {
    return NextResponse.json(
      { error: "Missing misspelling or correct word" },
      { status: 400 },
    )
  }

  const openaiEndpoint = process.env.AZURE_OPENAI_ENDPOINT
  const openaiKey = process.env.AZURE_OPENAI_KEY
  const openaiDeployment = process.env.AZURE_OPENAI_DEPLOYMENT
  const openaiApiVersion = process.env.AZURE_OPENAI_API_VERSION
  const speechKey = process.env.AZURE_SPEECH_KEY
  const speechRegion = process.env.AZURE_SPEECH_REGION

  if (!openaiEndpoint || !openaiKey || !openaiDeployment || !speechKey || !speechRegion) {
    return NextResponse.json({ error: "Missing Azure credentials" }, { status: 500 })
  }

  // Step 1: GPT feedback generation
  let feedbackText: string
  try {
    const client = new AzureOpenAI({
      endpoint: openaiEndpoint,
      apiKey: openaiKey,
      apiVersion: openaiApiVersion || "2024-12-01-preview",
      deployment: openaiDeployment,
    })

    const completion = await client.chat.completions.create({
      model: openaiDeployment,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `The student spelled "${misspelling}" instead of "${correct}".`,
        },
      ],
      max_tokens: 100,
    })

    feedbackText = completion.choices[0]?.message?.content?.trim() ?? ""
    if (!feedbackText) {
      return NextResponse.json({ error: "GPT returned empty response" }, { status: 500 })
    }
  } catch (e) {
    return NextResponse.json(
      { error: "GPT generation failed", details: String(e) },
      { status: 500 },
    )
  }

  // Step 2: Azure Speech TTS via REST API
  try {
    const ssml = `<speak version="1.0" xml:lang="en-US">
  <voice name="en-US-Bree:DragonHDLatestNeural">
    <prosody rate="-30%">${escapeXml(feedbackText)}</prosody>
  </voice>
</speak>`

    const ttsRes = await fetch(
      `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": speechKey,
          "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-16khz-32kbitrate-mono-mp3",
          "User-Agent": "SpellingBee",
        },
        body: ssml,
      },
    )

    if (!ttsRes.ok) {
      const body = await ttsRes.text()
      return NextResponse.json(
        { error: "TTS synthesis failed", details: body },
        { status: 500 },
      )
    }

    const audioBuffer = await ttsRes.arrayBuffer()
    if (audioBuffer.byteLength === 0) {
      return NextResponse.json({ error: "TTS returned empty audio" }, { status: 500 })
    }

    return new NextResponse(audioBuffer, {
      headers: { "Content-Type": "audio/mpeg" },
    })
  } catch (e) {
    return NextResponse.json(
      { error: "TTS synthesis failed", details: String(e) },
      { status: 500 },
    )
  }
}
