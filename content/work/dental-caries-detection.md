## TL;DR
A YOLO26n object detector that screens intraoral phone photos for tooth decay. On **285 test images of people the model never saw**, it reaches **0.942 mAP50** with precision 0.887 and recall 0.885. At the screening threshold I chose (0.4), recall rises to **0.928**.

> Learning project, not a diagnostic tool.

## Problem
Dental caries is common and cheap to treat early, but many people in Pakistan never see a dentist until it hurts. A phone photo is something almost anyone can take. Could a small model flag likely decay from such a photo, well enough to tell someone *"get this checked"*?

## Data
- **Source:** an annotated intraoral image dataset published in *Scientific Data* (2025), collected by Aga Khan University in Mithi, Sindh, and released on Zenodo under **CC BY 4.0**.
- **6,265 images, 2,227 annotated.** I excluded unlabelled images: a missing label does not prove a tooth is healthy.
- **Cleaning:** dropped 16 images with out-of-range box coordinates, and merged the permanent (`D`) and primary (`d`) tooth classes into one `caries` class.
- **Split by person, not by image.** The same mouth photographed twice must not appear in both train and test, or the score measures memory instead of skill. Participants (or session timestamps as a fallback) were assigned to exactly one split: **1,632 train · 294 validation · 285 test**, with no person shared.

## Approach
1. Explored the data and annotation quality in notebooks.
2. Fine-tuned **YOLO26n** from COCO-pretrained weights at 640 px on a Colab **T4 GPU**. Early stopping picked **epoch 66 of 86**.
3. Evaluated on the held-out test set and swept the confidence threshold.
4. Packaged inference as a small Python package (`caries_detector/`) with a **pytest** suite and a **Streamlit** app with a threshold slider.

## Choosing the threshold
This is a *screening* tool, so a missed cavity is worse than a false alarm. I picked the threshold for recall rather than for the best F1:

| Confidence threshold | Precision | Recall |
|---|---|---|
| 0.2 | 0.782 | 0.956 |
| **0.4 (chosen)** | **0.840** | **0.928** |

## Results
| Split | Precision | Recall | mAP50 | mAP50-95 |
|---|---|---|---|---|
| Validation | 0.838 | 0.910 | 0.940 | 0.747 |
| **Test (unseen people)** | **0.887** | **0.885** | **0.942** | **0.744** |

![Training curves](/static/img/dental-training-curves.png)
![F1–confidence curve](/static/img/dental-f1-curve.png)

## Error analysis
- Some "false positives" look like real lesions the annotators didn't box, so precision is probably **understated**.
- Several boxes sometimes cover one tooth, because the annotations themselves were inconsistent.
- Most misses are **small lesions on back teeth near the image edge**.
- **Brown staining** can be confused with decay.

## Limitations
One phone model, one region (Mithi, Sindh) and ages 10–24. Accuracy may drop with other devices, lighting or populations. That is why the app is framed as a learning project and not a medical device.

## What's next
- Test on photos from other phones and regions.
- Tooth-level counting instead of raw boxes, to remove duplicate boxes on one tooth.
- A lightweight on-device version — the browser demo on this site is the first step.

![The Streamlit app](/static/img/dental-app.jpg)

*Dataset credit: intraoral image dataset, Aga Khan University, published in Scientific Data (2025), Zenodo, CC BY 4.0.*
