请求参数
model string required
需要使用的模型名称

messages object array required
迄今为止用户输入或模型生成的不同类别消息列表

展开/收起
tools object array optional
Toolcall支持的函数列表

展开/收起
audio object optional
用于控制音频输出的参数，只在支持端到端模型场景的模型下生效（step-1o-audio/step-audio-2/step-audio-2-mini）

展开/收起
modalities string array optional
指定输出的模态类型，支持 text、audio 两种模态类型，只在端到端模型场景下必填。如果需要模型输出音频，则需要将 audio 添加到该参数中，建议设置为 ["text", "audio"]。

max_tokens int optional
聊天需要生成的标记最大数量，默认值为INF（不作限制，由模型自动决定）。输入标记和生成标记的总数量受限于指定模型的最大上下文长度。

temperature float optional
采样温度，介于0.0和2.0之间的数字。较高值（如0.8）会使生成更随机，较低值（如0.2）会使其生成结果更集中且确定。默认值为0.5

top_p float optional
核心采样，该值会使模型生成具有top_p概率质量的标记并输出到结果。默认值为0.9

n int optional
控制模型为每个输入消息生成的响应消息结果条数，默认值为1，最大不限，建议不超过5。

stream bool optional
是否流式生成响应消息，默认值为false

stop string | string array optional
用于指导模型生成聊天响应过程中，是否遇到stop中的内容，进行生成中断，默认为空

frequency_penalty float optional
默认为0。介于0.0和1.0之间的数字。值较高会使模型生成某token时，根据其过往在生成文本中出现的频度，进行后续降频惩罚，从而降低模型重复生成相同内容的可能性

response_format object optional
用于指导模型输出特定格式的内容。默认为 {"type":"text"}，表示输出文本。设置为 { "type": "json_object" } 可以开启 JSON Mode，输出可解析的 JSON 结构。

reasoning_format object optional
用于指导模型输出时使用的 reasoning 字段；默认为 general，表示通用推理，使用 reasoning 字段返回结果；可选项为 [general,deepseek-style]。当设置为 deepseek-style 时，可使用 DeepSeek 兼容的的 reasoning_content 字段获取到 reasoning 内容。

请求响应
返回Chat Completion响应对象，或者Chat Completion流式响应对象块

示例


from openai import OpenAI
 
client = OpenAI(api_key = "STEP_API_KEY", base_url = "https://api.stepfun.com/v1")
 
completion = client.chat.completions.create(
  model = "step-1-8k",
  messages = [
    {
      "role": "system",
      "content": "你是由阶跃星辰提供的AI聊天助手，你擅长中文，英文，以及多种其他语言的对话。在保证用户数据安全的前提下，你能对用户的问题和请求，作出快速和精准的回答。同时，你的回答和建议应该拒绝黄赌毒，暴力恐怖主义的内容",
    },
    {
      "role": "user",
      "content": "你好，请介绍一下阶跃星辰的人工智能!"
    }
  ],
)
 
print(completion)
 
返回


{
    "id": "b7b56af0-52a6-483f-a589-948182676a1b",
    "object": "chat.completion",
    "created": 1709893411,
    "model": "step-1-8k",
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "你好！阶跃星辰是一家专注于人工智能技术的公司，致力于开发和提供各种AI解决方案。我们的人工智能技术涵盖了自然语言处理、计算机视觉、机器学习等领域，旨在帮助用户在各个行业和领域中提高效率和创造价值。\n\n我们提供多种AI产品和服务，包括智能客服、虚拟助手、智能推荐、智能审核等。这些产品和服务可以应用于多个行业，如金融、零售、教育、医疗等。通过使用我们的AI技术，用户可以更好地理解和分析数据，提供个性化的服务和体验，提高决策效率和准确性。\n\n我们注重用户数据的安全和隐私保护，严格遵守相关法律法规和行业标准。我们相信，人工智能技术应该为人类创造更多的福祉，而不是带来负面的影响。我们将继续努力，为用户提供更加智能、高效、安全的AI解决方案。"
            },
            "finish_reason": "stop"
        }
    ],
    "usage": {
        "prompt_tokens": 83,
        "completion_tokens": 176,
        "total_tokens": 259
    }
}
