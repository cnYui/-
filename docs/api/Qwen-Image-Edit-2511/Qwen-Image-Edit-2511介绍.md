

# **简介**



我们很高兴推出 Qwen-Image-Edit-2511，这是在 Qwen-Image-Edit-2509 基础上的增强版本，包含多项改进——尤其是显著提升了生成一致性。要体验最新模型，请访问 [Qwen Chat](https://chat.qwen.ai/?inputFeature=image_edit) 并选择图像编辑功能。

Qwen-Image-Edit-2511 的主要增强包括：减轻图像漂移、提升人物一致性、集成 LoRA 能力、增强工业设计生成能力，以及强化几何推理能力。

## **快速开始**

安装最新版本的 diffusers

```
pip install git+https://github.com/huggingface/diffusers

```

以下代码片段展示了如何使用 `Qwen-Image-Edit-2511`：

```
import os
import torch
from PIL import Image
from modelscope import QwenImageEditPlusPipeline

pipeline = QwenImageEditPlusPipeline.from_pretrained("Qwen/Qwen-Image-Edit-2511", torch_dtype=torch.bfloat16)
print("pipeline loaded")

pipeline.to('cuda')
pipeline.set_progress_bar_config(disable=None)
image1 = Image.open("input1.png")
image2 = Image.open("input2.png")
prompt = "The magician bear is on the left, the alchemist bear is on the right, facing each other in the central park square."
inputs = {
    "image": [image1, image2],
    "prompt": prompt,
    "generator": torch.manual_seed(0),
    "true_cfg_scale": 4.0,
    "negative_prompt": " ",
    "num_inference_steps": 40,
    "guidance_scale": 1.0,
    "num_images_per_prompt": 1,
}
with torch.inference_mode():
    output = pipeline(**inputs)
    output_image = output.images[0]
    output_image.save("output_image_edit_2511.png")
    print("image saved at", os.path.abspath("output_image_edit_2511.png"))


```

## **展示**

**Qwen-Image-Edit-2511 提升人物一致性**  
在 Qwen-Image-Edit-2511 中，人物一致性得到了显著改善。该模型能够基于输入的人像进行富有想象力的编辑，同时保留主体的身份特征和视觉风格。



**改进多人一致性**  
虽然 Qwen-Image-Edit-2509 已经提升了单人编辑的一致性，但 Qwen-Image-Edit-2511 进一步增强了多人合影场景中的一致性表现——能够将两张独立的人物图像高保真地融合为一张协调的群像照片：

**内置支持社区创作的 LoRA 模型**  
自 Qwen-Image-Edit 发布以来，社区已开发出许多富有创意且高质量的 LoRA 模型，极大地拓展了其表达潜力。Qwen-Image-Edit-2511 将部分精选的热门 LoRA 直接集成到基础模型中，无需额外微调即可启用其效果。

例如，光照增强 LoRA：  
现在可开箱即用地实现逼真的光照控制：



另一个例子，现在可直接使用基础模型生成新的视角：





**工业设计应用**

我们特别关注了实际工程应用场景，例如批量工业产品设计：





……以及工业零部件的材质替换：



**增强的几何推理能力**  
Qwen-Image-Edit-2511 引入了更强的几何推理能力——例如，可直接为设计或标注目的生成辅助构造线：





以上便是 Qwen-Image-Edit-2511 的主要更新内容。  
尽情探索新功能吧！🎉



  
  
  
