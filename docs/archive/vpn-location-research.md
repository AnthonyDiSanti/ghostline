> Archived owner-supplied research, received 2026-09-07. Its citation tokens refer to an external research session and are not resolvable in this repository. Treat legal conclusions as supplied research, not independently verified guarantees. Current deployment decisions live in [region selection](../region-selection.md); the instruction to replace Frankfurt is superseded by Anthony’s decision to preserve it during the Cape Town trial.

# Selecting a Privacy-Preserving AWS Exit Region for Dubai

## Executive finding

**I would move the prototype from Frankfurt (`eu-central-1`) to Cape Town (`af-south-1`).**

After screening AWS's currently available commercial regions, then working outward from Dubai and applying your two hard requirements—**no censorship sandbox and no jurisdictional pressure toward identity/age verification for ordinary adult web access**—Cape Town is the first region I found that I am comfortable calling an **adequate privacy-oriented exit** rather than merely a less-bad one. AWS lists Cape Town as a three-Availability-Zone region; it is opt-in for standard AWS accounts. citeturn18view0

The reason I would go as far as South Africa rather than simply jumping from Frankfurt to Zurich, Tel Aviv, Singapore, or Taipei is that those closer alternatives all introduce a meaningful qualification:

- Germany and the wider EU are moving directly toward strong age-assurance infrastructure for adult content. citeturn17view0turn23search2
- The UK already mandates strong age checks for pornography. citeturn21search13
- Switzerland is outside the EU, but since January 2025 it has had a new federal youth-protection regime requiring age checks around films, video games, and on-demand audiovisual services; that is uncomfortably close to the exact policy category you are trying to escape. citeturn23search3turn23search7
- Taiwan has no general platform age-verification requirement in the legal research I found and is highly rated for internet freedom, but it also carried out extensive DNS blocking in 2025, including blocking an LGBT-oriented site under child-protection authority. citeturn21search6turn19view0
- Japan has an exceptionally open internet by Freedom House's measures, but I found conflicting material about age-check obligations around adult content. Given that identity/age verification is a **hard privacy requirement**, I would not choose a jurisdiction where the answer remains ambiguous when a cleaner candidate is available. citeturn21search0turn21search19
- South Africa is rated **Free, 73/100 for internet freedom**, with **no network restrictions and no websites blocked** in Freedom House's 2025 assessment. The latest comparative legal research I found also states that South Africa did not have a specific online age-verification law, while the current Film and Publication Board framework centers on classification and protecting children rather than a Germany/UK-style identity gate for adult web users. citeturn18view1turn10search4turn5search13

There is one important limitation to that conclusion: **no exit jurisdiction can guarantee that an individual website will never voluntarily demand age or identity verification.** The achievable goal is to avoid an exit whose local law creates the requirement or a strong incentive for websites to impose it based on your IP. EFF makes essentially the privacy case underlying your requirement: age-assurance systems can involve government IDs, facial scans, inferred age, or other personal data and create new barriers to otherwise lawful internet access. citeturn17view3

My resulting ranking for this project is:

| Priority | AWS region | Assessment |
|---|---|---|
| **Recommended primary** | **`af-south-1` — Cape Town** | Best combination I found of open internet + low age-verification risk |
| Performance-oriented alternative | `ap-east-2` — Taipei | Closer to Dubai and no general AV mandate found, but meaningful government DNS blocking |
| Requires more legal work | `ap-northeast-3` — Osaka | Excellent internet-freedom record, but adult-content age-verification evidence is ambiguous |
| Do not use for this requirement | `eu-central-2` — Zurich | Close and non-EU, but Swiss youth-protection age-check regime makes it a poor privacy bet |
| Do not use | `eu-central-1` — Frankfurt | Exactly the age-verification problem you have already observed |

## The AWS region universe

AWS currently lists the following regions for ordinary AWS accounts. AWS itself recommends considering proximity because choosing a region closer to users can reduce network latency, although geographic distance is obviously only a proxy for actual Internet routing. citeturn18view0

| Geography | AWS regions |
|---|---|
| **Middle East** | UAE `me-central-1`, Bahrain `me-south-1`, Tel Aviv `il-central-1` |
| **India** | Mumbai `ap-south-1`, Hyderabad `ap-south-2` |
| **Europe** | Milan `eu-south-1`, Stockholm `eu-north-1`, Zurich `eu-central-2`, Frankfurt `eu-central-1`, Paris `eu-west-3`, London `eu-west-2`, Ireland `eu-west-1`, Spain `eu-south-2` |
| **Southeast/East Asia** | Thailand `ap-southeast-7`, Malaysia `ap-southeast-5`, Singapore `ap-southeast-1`, Jakarta `ap-southeast-3`, Taipei `ap-east-2`, Seoul `ap-northeast-2`, Osaka `ap-northeast-3`, Tokyo `ap-northeast-1`, Hong Kong `ap-east-1` |
| **Africa** | Cape Town `af-south-1` |
| **Oceania** | Melbourne `ap-southeast-4`, Sydney `ap-southeast-2`, New Zealand `ap-southeast-6` |
| **North America** | N. Virginia `us-east-1`, Ohio `us-east-2`, N. California `us-west-1`, Oregon `us-west-2`, Canada Central `ca-central-1`, Calgary `ca-west-1`, Mexico Central `mx-central-1` |
| **South America** | São Paulo `sa-east-1` |

That leaves a surprisingly large theoretical search space, but we can eliminate much of it without treating every AWS region as equally attractive.

The United States, for example, is not a good privacy default for this particular requirement. EFF reported in December 2025 that **more than half of U.S. states had passed some form of Internet age-verification mandate**, and it has continued opposing additional federal proposals in 2026. Which state a service associates with an AWS address therefore becomes an undesirable additional variable. citeturn17view3

The EU is similarly unattractive as a strategic home for this service even where a particular member state has not yet reproduced Germany's exact rules. The European Commission's current age-verification initiative explicitly begins with proving that a user is over 18 for legally restricted online content including pornography, and the Commission has been pursuing major adult platforms under the Digital Services Act over protection of minors. citeturn23search2turn21news39

That does **not** mean “EU Internet = censored Internet.” It means EU jurisdictions are a poor match for *your unusually strict requirement that the exit location itself not create age-assurance pressure*. Those are different standards.

## Working outward from Dubai

I used rough great-circle distance between Dubai and the AWS region's metropolitan area only as a prioritization proxy. These are **not measured RTT values** and should not be interpreted as such. AWS itself merely says proximity *can* reduce latency. citeturn18view0

The important part of the funnel looks approximately like this:

| Exit | Approx. straight-line distance from Dubai | Result |
|---|---:|---|
| UAE | ~120 km | Defeats the project's censorship-escape purpose |
| Bahrain | ~480 km | Does not meet the open-internet bar |
| Mumbai | ~1,940 km | Does not meet the open-internet bar |
| Tel Aviv | ~2,140 km | Better, but not clean enough |
| Hyderabad | ~2,550 km | Does not meet the open-internet bar |
| Milan | ~4,670 km | EU age-assurance exposure |
| Stockholm | ~4,760 km | EU age-assurance exposure |
| **Zurich** | **~4,760 km** | Non-EU, but Swiss age-check law creates concern |
| Frankfurt | ~4,840 km | Known failure against your requirement |
| Bangkok | ~4,890 km | Does not meet the open-internet bar |
| Paris | ~5,250 km | EU; France has a particularly strong AV regime |
| London | ~5,470 km | Mandatory strong age assurance |
| Kuala Lumpur | ~5,530 km | Does not meet open-internet criterion |
| Singapore | ~5,840 km | Partly Free rather than Free in Freedom House's latest assessment |
| Dublin | ~5,920 km | EU age-assurance exposure |
| Jakarta | ~6,580 km | Does not meet open-internet criterion |
| **Taipei** | **~6,600 km** | Strong candidate, but government site blocking remains a concern |
| Seoul | ~6,780 km | Not as clean a match as the remaining candidates |
| **Osaka** | **~7,600 km** | Very open Internet; AV-law ambiguity |
| **Cape Town** | **~7,640 km** | **Pass** |

The exact ordering of places separated by only tens of kilometers is not meaningful for network performance. What matters is that Cape Town is materially farther away than Frankfurt, while Taipei is roughly a thousand kilometers closer than Cape Town.

### Why Tel Aviv did not end the search

Tel Aviv is geographically compelling. Israel's overall Freedom House rating is **Free, 73/100**, although Freedom House does not currently produce a Freedom on the Net score for Israel. citeturn20search12

The problem for this project is that Israel has had statutory authority since 2017 allowing police and prosecutors to obtain court orders requiring ISPs to block websites associated with criminal or offensive content. That does not mean ordinary pornography is broadly unavailable, nor did I find evidence of a Germany-style universal adult-site identity-verification rule. But it makes Tel Aviv a weaker match for the stated product requirement of an exit into a clearly open Internet. citeturn20search1turn20search16

Because we have viable choices in markedly freer Internet environments, I would not make the project's default exit depend on arguing about where the boundaries of an Israeli site-blocking statute fall.

### Why simply changing Frankfurt to Zurich is less attractive than it first appears

**Zurich initially looked like the obvious answer.** It is essentially Frankfurt-distance from Dubai, AWS operates `eu-central-2` there, Switzerland is outside the EU, and it has strong general civil-liberties protections. AWS lists Zurich as a three-AZ, opt-in region. citeturn18view0turn22search19

But the deeper legal check changed my view.

Switzerland's **Federal Act on the Protection of Minors in the Film and Video Game Sectors** began taking effect on January 1, 2025. Legal analyses of the statute describe age-verification checks when age-rated films and games are made available, together with obligations on on-demand providers to take effective measures to prevent minors from accessing unsuitable content. The framework specifically reaches online/on-demand audiovisual services and sexually explicit material. citeturn23search3turn23search7turn23search27

I am **not** claiming this is identical to Germany's porn-site regime or that a Swiss IP will necessarily produce the same ID prompt you are seeing from Frankfurt. It is not. The problem is strategic: you are designing the exit jurisdiction specifically to get away from privacy-invasive age assurance. Switzerland has recently legislated in the very same policy domain.

That makes Zurich an unnecessarily fragile choice.

### Why the EU as a whole is a poor long-term target

Your Frankfurt behavior is consistent with Germany's longstanding approach. The Free Speech Coalition's global policy tracker says Germany has required platforms serving pornography to keep minors out through age verification for years, with Internet enforcement becoming more active from 2019 onward. Germany has also pursued blocking of foreign adult sites over noncompliance. citeturn17view0

The direction of travel is now broader than Germany. The European Commission describes its age-verification initiative as a mechanism allowing EU users to prove they are over 18 when accessing legally age-restricted online material, explicitly listing pornography among the initial use cases. citeturn23search2

The Commission's March 2026 preliminary findings against Pornhub, Stripchat, XNXX, and XVideos also alleged failures to adequately prevent minors from accessing adult content. citeturn21news39

So while individual EU countries differ considerably today, **I would remove all EU AWS regions from the candidate set for this project's default censorship/privacy exit**. That is a product-design judgment based on the regulatory trajectory, not a statement that every EU state currently demands government ID to visit every adult site.

London is even clearer: Ofcom says that since July 25, 2025, services allowing pornography have had to implement strong age checks. citeturn21search13

## The strongest later candidates

### Taipei is the tempting performance compromise

Taiwan deserves serious consideration.

Freedom House gives Taiwan an **Internet Freedom score of 79/100, “Free,”** the strongest result among the Asian AWS-region candidates we examined. It reports no network restrictions and describes Taiwan as one of Asia's freest online environments. citeturn17view1turn18view2

More importantly for your specific issue, a current comparative legal study of Taiwan's child-online-protection rules states:

> Online platforms are not required to implement any method of age verification before a user can access their services.

That makes Taiwan substantially more attractive for your identity/privacy requirement than Germany, the UK, or the current EU direction. citeturn21search6

The reason I would **not** make it the default is censorship.

Freedom House reports that Taiwan's DNS Response Policy Zone system designated **more than 50,000 websites for blocking during the first half of 2025**, with the vast majority not subject to judicial review. It specifically reports that authorities blocked an LGBT-focused bulletin-board site in February 2025 following a Ministry of Health and Welfare request under child-protection law. citeturn19view0

That is precisely the kind of detail that a headline score of “79/100 Free” can obscure.

For most ordinary browsing, Taiwan is dramatically more open than the UAE and likely works perfectly well. But we are deliberately choosing the egress for an **anti-censorship** system. I therefore think the proper interpretation is:

**Taipei is the best performance-oriented second choice, not the cleanest policy choice.**

The AWS region is `ap-east-2`, contains three AZs, and requires account opt-in. citeturn18view0

### Japan is exceptionally open, but I would not select it yet

Freedom House's evidence for Japan is excellent: **78/100, Free; no restricted networks; no blocked websites; no blocked social media; and no users arrested** in its 2025 Internet-freedom summary. It specifically describes Japanese Internet freedom as robust. citeturn21search0turn21search12

That arguably makes Japan an even cleaner **censorship** jurisdiction than Taiwan.

The problem is the second requirement. I found inconsistent information regarding exactly when Japanese adult-content services must perform consumer age verification. One industry-oriented source describes age verification as mandatory in the Japanese adult-content sector, but my source set was not good enough to establish whether that means general anonymous webpage access, transactions/accounts, domestic content providers, or some combination of those. citeturn21search19

For a normal VPN recommendation I might accept that uncertainty. For a project whose explicit acceptance criterion is **“do not put me behind an identity-verification jurisdiction,”** I would not.

Osaka is almost exactly Cape Town distance from Dubai anyway—roughly 7,600 km versus approximately 7,640 km—so there is little geographic justification for accepting the ambiguity.

### Cape Town has the cleanest evidence

Cape Town is where the search produces the first combination I consider adequate.

Freedom House's 2025 South Africa report says:

| Metric | South Africa |
|---|---:|
| Internet Freedom | **73 / 100 — Free** |
| Global Freedom | **81 / 100 — Free** |
| Networks restricted | **No** |
| Websites blocked | **No** |

citeturn18view1

That “websites blocked: no” result is particularly valuable for this product. Taiwan scores six points higher overall but receives a “yes” on website blocking; South Africa does not. citeturn17view1turn18view1

On the age-verification side, the most directly relevant comparative legal research I found states that **South Africa had no specific online age-verification law**, while noting that its POPIA privacy regime still applies. Current material from South Africa's Film and Publication Board focuses on classification, age restrictions, and child protection rather than imposing a UK/Germany-style identity-verification system on adults merely browsing lawful adult websites. citeturn5search13turn10search4turn10search21

That is necessarily an **absence-of-law finding**, which should be treated with more caution than pointing to a statute that affirmatively requires verification. Laws also change. I therefore would phrase the conclusion narrowly:

**As of this research, I found no South African national requirement analogous to Germany's or Britain's that should cause an ordinary adult website to demand strong age/identity verification simply because the user's IP geolocates to South Africa.**

Combined with Freedom House's finding of no website blocking, that is the closest match to the product specification among the AWS regions we reached before stopping the search. citeturn18view1

## Recommendation for the architecture

I would change the project's default deployment from:

`eu-central-1 / Frankfurt`

to:

**`af-south-1 / Cape Town`**

and keep the architecture otherwise unchanged for the PoC:

```text
Dubai
   │
   │  VLESS + REALITY
   ▼
AWS af-south-1
Cape Town
   │
   ├── EC2
   ├── Elastic IP
   └── Amnezia-managed Xray
          │
          ▼
      Open Internet
```

AWS marks `af-south-1` as opt-in, so the account will need the region enabled before CDK deployment. It has three Availability Zones. citeturn18view0

For a later two-exit design, my current preference would actually be:

```text
Primary privacy exit
af-south-1 / Cape Town
        │
        │
        └──── manually selectable ────┐
                                      │
Performance fallback                  │
ap-east-2 / Taipei  ◄─────────────────┘
```

That is more useful than keeping Frankfurt as the backup. Frankfurt gives you a lower-latency route that knowingly violates one of the product's core privacy requirements. Taipei gives you a geographically closer route that has **no general age-verification requirement identified in the legal research**, while accepting that Taiwan is not as clean on government website blocking as South Africa. citeturn21search6turn19view0

I would **not** automatically fail over between them later. The distinction is policy-relevant enough that the client should eventually display something like “Privacy exit — South Africa” versus “Low-latency exit — Taiwan,” rather than treating all endpoints as interchangeable.

## What this means for performance and privacy

Cape Town is roughly **2,800 km farther from Dubai than Frankfurt by straight-line distance**, so I expect higher round-trip latency. That is an inference from geography, not a measured result. AWS itself notes only that closer regions can reduce latency; the public Internet route ultimately determines the actual outcome. citeturn18view0

I nevertheless think it is the correct trade for this prototype.

Your success criterion is a **stable connection that escapes the UAE censorship environment**, not competitive gaming latency. Once a video stream has established and buffered, sustained throughput and connection stability matter considerably more than shaving tens of milliseconds from RTT. The fact that the working REALITY tunnel has already demonstrated that the architecture solves the hard part makes exit-jurisdiction quality the next design constraint rather than simply chasing the nearest AWS region.

I would also keep the meaning of “privacy-preserving exit” very precise. It means:

**The exit jurisdiction does not itself force the ordinary lawful browsing use case into an identity/age-verification regime, and its Internet environment has low censorship.**

It does **not** mean that the exit is anonymous to AWS, that AWS cannot comply with lawful demands concerning your infrastructure, that every destination site will accept an AWS datacenter address, or that an individual adult site cannot independently impose account or age checks. Those are different threat models.

EFF's criticism helps explain why this distinction matters. Its current age-verification resource hub argues that the various approaches—including ID upload, face-based estimation, and systems based on other personal information—all require collection of sensitive data and impose barriers to Internet access. That aligns closely with the privacy requirement you have defined for this project. citeturn17view3

**For the next deployment, I would therefore set `af-south-1` as the CDK default and treat `ap-east-2` as the first alternate region.** Cape Town is not the geographically nearest possible uncensored exit; it is the nearest one I reached for which the combination of current censorship evidence and age-verification evidence is clean enough that I would stop the search.
