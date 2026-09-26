# Healthcare AI Hackathon — Submission Draft

**Working draft, not a completed submission.** I will update the bracketed details and describe only what I actually build. I have not established access to patient data or demonstrated clinical accuracy.

## 1. Team members' names

I'm [Asit Tarsode](https://www.linkedin.com/in/asit-tarsode/), a machine learning engineer. I have built AI biomarkers from pathology images to predict patient survival and inform chemotherapy treatment selection. This is my attempt to explore an AI based biomarker for cardiology.

## 2. Project name

**Heart Echo AI — I want to get a richer reading from the heart ultrasound clinicians already order.**

## 3. What problem are you solving, and why does it matter?

In pulmonary arterial hypertension (PAH), high pressure in the lung's blood vessels strains the heart's right pumping chamber, the **right ventricle (RV)**. Doctors already use ultrasound images of the heart (*echocardiograms, or echoes*) along with symptoms, blood tests, and exercise tests to assess patients. But a few standard measurements can compress a complex, moving chamber into isolated numbers. Two patients with similar numbers may have different patterns of RV motion or different outcomes.

I want to **add information to the existing assessment**, not replace it or order a new scan. I will analyze the ultrasound video already collected and show an inspectable picture of how the RV contracts. My **hackathon focus**: can I extract a useful measurement from the video beyond the conventional snapshot? My **longer-term vision** is to compare that measurement across routine follow-up exams to tell whether a patient's RV is recovering or deteriorating. And also use the AI measurement to predict treatment effect, if it is validated as a biomarker.

## 4. Describe what you built today

I built a scrolling product demo around [a published PAH patient's follow-up measurements](https://pmc.ncbi.nlm.nih.gov/articles/PMC13176855/#pul270319-tbl-0001). In that report, one standard measurement (TAPSE) stayed at 20 mm while another (RV fractional area change) rose from 25% to 35% after treatment. I show the source-linked measurements alongside a **clearly simulated AI addendum**. The report does not supply that patient's echo video here, so I do not claim the illustrative AI curve measures her heart.

Below that clinical story, I run the real [EchoNet-RV ultrasound-trained segmentation model](https://github.com/echonet/RV) on a short window of a separately credited, normal heart ultrasound. It starts automatically: I can watch the outlined frames play as a video, pause, scrub to any sampled frame, or click a chart dot to inspect its contour. Two more selectable windows show [before and after treatment in a published influenza-cardiomyopathy video](https://commons.wikimedia.org/wiki/File:Influenza-Induced-Cardiomyopathy-An-Unusual-Cause-of-Hypoxemia-738146.f1.ogv); they are **not PAH videos**. I do not insert outputs from these videos into the published PAH patient's record. My output is 2D area motion, not 3D volume, MRI-equivalent measurement, clinical FAC, or a patient-specific risk prediction. I have not measured accuracy against expert labels or shown that my signal improves treatment decisions.

## 5. What is the path to real-world impact?

1. Collect data from real world settings to:
    - Validate if echo measurements can calculate RV contraction curves with consistency and match or exceed accuracy of human readers. Can also check accuracy with MRI-derived RV volume measurements if paired MRI is available.
    - Clinical validation of the RV contraction curve as a biomarker for patient outcomes for PAH and other diseases that affect the right ventricle. Potentially building up to validating treatment effect prediction.
2. After inital validation using open source models, train SSL pretrained stable models on a large dataset of echo videos to improve accuracy and robustness and finetune for sepcific clinical use cases.
3. Publish results, use publications to collect robust clinical trial data to validate the biomarker and treatment effect prediction.
4. Work towards FDA approval / sell to echo machine vendors to integrate into their software, or partner with a hospital to integrate into their echo reading workflow.

## 6. Live prototype or demo link

I tested the working demo in a fresh browser at [Heart Echo AI](https://goes-hobby-orange-respective.trycloudflare.com/rv-signal/index.html). This is a **temporary public HTTPS tunnel**, so I must keep the laptop and server running during judging and recheck the link just before submitting.

## 7. Code repository link

[I will add the actual link to my hackathon code after it is published.]

## 8. Slides or additional material

[I will add a short pitch or video link if I make one.]

## Hackathon submission confirmation

- [ ] I have checked that this submission describes only my team's own hackathon work and real results.
- [ ] I have disclosed the source and permissions for each image and any patient data.
- [ ] I have tested the demo and repository links from outside the team.

## Background sources (not evidence that this project works)

- I cite [Schneijdenberg et al., *Pulmonary Circulation* (2026), Table 1](https://pmc.ncbi.nlm.nih.gov/articles/PMC13176855/#pul270319-tbl-0001), DOI 10.1002/pul2.70319, for the real patient's reported measurements; its video is not in my demo.
- I cite [2025 right-heart ultrasound guidance](https://pubmed.ncbi.nlm.nih.gov/40044341/) for the existing clinical role of echo.
- I cite a [published PAH automated-echo study](https://pubmed.ncbi.nlm.nih.gov/40876740/) to acknowledge earlier AI and its reported FAC bias.
