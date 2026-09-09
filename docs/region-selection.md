# Endpoint region and destination privacy

Assessment updated: 2026-09-09. **Stockholm (`eu-north-1`) is the intended next trial; prefer it over Milan on content-blocking risk even when age verification is excluded.** Frankfurt remains the owner-proven faster alternative to Cape Town. Retain Cape Town as backup. Anthony excludes Tel Aviv because he does not want a persistent UAE-to-Israel connection. Respect that endpoint-selection constraint without treating his prediction of surveillance attention as an independently established fact. Anthony subsequently authorized Stockholm; it is deployed alongside Cape Town. See [launch evidence](launch-stockholm.md) for tests and remaining client validation.

Latest direction: Anthony agrees Stockholm is worth testing as the intended primary. Retain Cape Town as backup and validate actual performance before promotion. Geographic proximity alone does not establish that Stockholm is faster than Frankfurt; deployment is complete, but practical performance validation remains pending.

Anthony reports Cape Town is too slow on **both AWG and REALITY**, while Frankfurt was substantially faster. Earlier macOS/iOS practical passes establish connectivity, not satisfactory ongoing performance. Frankfurt remains retired; see [lifecycle evidence](launch.md). Cape Town should remain available for destinations that cause verification friction on a nearer primary.

## Milan versus Stockholm, excluding age verification

Recommend **Stockholm first** in this head-to-head. Milan's roughly 100 km geographic advantage (about 4,660 versus 4,760 km using city-centre great-circle estimates) is insufficient to predict real performance. Neither region had been tested at the time of this head-to-head; subsequent Stockholm checks are in its launch record. A more direct route to Milan could outperform Stockholm, but this is an untested possibility, not a measured advantage.

Italy has a material content-blocking concern independent of age verification: Piracy Shield. [AGCOM's January 8, 2026 announcement](https://www.agcom.it/node/45912/printable/print) reports over 65,000 FQDNs and around 14,000 IPs disabled since the system began, alongside enforcement against Cloudflare. [AGCOM's launch description](https://www.agcom.it/sites/default/files/migration/article/Comunicato%20stampa%2005-02-2024.pdf) describes a 30-minute blocking process. [Cloudflare's March 2026 account](https://blog.cloudflare.com/standing-up-for-the-open-internet/) reports collateral blocking of unrelated sites sharing infrastructure, including disruption to Google Drive. Attribute those incident claims to Cloudflare, which is contesting the system; the regulator independently confirms the blocking program and enforcement. The resulting preference for Sweden is an engineering judgment about access risk, not a measured AWS egress comparison.

Sweden also has targeted blocking: a [Swedish appellate court decision](https://www.domstol.se/nyheter/2020/06/internetleverantor-ska-blockera-domannamn-och-webbadresser/) ordered Telia to block named copyright-infringing services and additional addresses for those services. Do not call Sweden literally unfiltered, or infer that a Telia order describes AWS behavior. No specific block has been tested on a Ghostline deployment in either country.

Both regions support the T3 family in [AWS's instance catalog](https://docs.aws.amazon.com/ec2/latest/instancetypes/ec2-instance-regions.html), so the current one-host/two-EIP runtime has no identified architectural reason to change. Regional AMI, AZ offering and quotas still require launch preflight. [AWS's region catalog](https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html) lists Milan as opt-in and Stockholm as enabled by default. This is a small setup difference, not a reason to choose a slower route. Region-specific prices were not compared in this head-to-head; do not claim a cost winner.

Test Stockholm first and keep Cape Town intact. If Stockholm's actual experience disappoints, use the known-good Frankfurt route as the next baseline or compare Milan if desired. This adds an internet-filtering rationale to the existing Stockholm trial direction without treating age verification as a gate.

## Scenario: ignore age verification when choosing the primary

Anthony asked what changes if age verification is removed from the region comparison. **Under that assumption, recommend Frankfurt (`eu-central-1`) first.** It already provided substantially better performance than Cape Town on his connection, and the prior reason to leave was verification friction. Stockholm, Zurich and Milan become alternatives to benchmark rather than demonstrably better choices. Tel Aviv remains excluded, and Cape Town remains the intended backup. This is a scenario assessment, not authorization to redeploy Frankfurt or permanently rewrite the product's privacy acceptance criteria.

Germany is rated **Free, 74/100** in [Freedom House's 2025 internet-freedom assessment](https://freedomhouse.org/country/germany/freedom-net/2025), with high access and a diverse online media environment. It still has content restrictions and surveillance concerns. Interpret the practical target as broad access to ordinary websites and services without the UAE's filtering; do not describe Germany, any AWS region or a future deployment as literally unfiltered. Country-level ratings also do not prove that a particular restriction applies identically to residential ISPs and AWS egress.

Removing age verification does not erase other censorship criteria: the [India assessment](https://freedomhouse.org/country/india/freedom-net/2025) and [Singapore assessment](https://freedomhouse.org/country/singapore/freedom-net/2025) document restrictions on internet freedom. Geographic proximity alone is insufficient reason to prefer those locations. A new Frankfurt deployment would still need a fresh practical check; the historical result is useful evidence, not a guarantee of current routing or bandwidth.

## Recommendation when age-verification friction still matters

Within the existing AWS regional EC2 architecture, Stockholm is the best next experiment for the combination of performance potential and reduced verification friction. It is approximately the same geographic distance from Dubai as Frankfurt, whose speed Anthony already found acceptable. The small differences among the closest European AWS regions do not establish a meaningful network advantage.

| Candidate | Approximate distance from Dubai | Assessment |
| --- | ---: | --- |
| Stockholm, `eu-north-1` | 4,760 km | Recommended trial. No general Swedish pornography visitor-ID mandate identified in this review; national proposals and EU enforcement remain relevant. Deployed; practical performance/destination trial pending. |
| Milan, `eu-south-1` | 4,670 km | Only about 90 km closer. Italy already enforces pornography age-verification obligations, so this is a weaker privacy bet. |
| Zurich, `eu-central-2` | 4,760 km | Essentially the same distance. Switzerland has age-check obligations for covered audiovisual providers, including pornography platforms; being outside the EU does not remove that concern. |
| Frankfurt, `eu-central-1` | 4,840 km | Owner-proven faster than Cape Town, but known compulsory verification signup. A reasonable performance-first fallback if Anthony chooses to accept manual switching for affected browsing; do not redeploy without authorization. |
| Cape Town, `af-south-1` | 7,640 km | Retain as backup; owner reports both protocols too slow for everyday use. |

Distances are rounded geographic estimates from the [supplied research](archive/vpn-location-research.md), **not RTT or throughput measurements**. ISP routing and peering can dominate the difference. Do not promise that Stockholm equals Frankfurt's actual speed or that a closer city guarantees improvement.

### Why Stockholm leads this comparison

The Swedish Parliament's [2025/26:KU18 decision](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/betankande/tryck-och-yttrandefrihet-massmediefragor_hd01ku18/), adopted January 21, 2026, rejected motions under point 6 including 2025/26:2991, which proposed mandatory pornography age verification and blocking noncompliant sites. This is evidence that those proposals did not enact a national mandate, not proof of the absence of every applicable restriction.

There is still policy movement. Sweden [commissioned work on digital age verification on September 4, 2026](https://www.regeringen.se/pressmeddelanden/2026/09/regeringen-vill-mojliggora-saker-digital-verifiering-av-alder/), including support for proposed social-media age limits. The [European Commission's age-verification initiative](https://digital-strategy.ec.europa.eu/en/policies/eu-age-verification) explicitly includes pornography and became feature-ready on April 15, 2026. Neither announcement proves that every Swedish adult-site visit currently requires ID. Together they mean Stockholm is a practical trial with Cape Town backup, not a guaranteed permanent no-verification jurisdiction.

By comparison, [Italy's AGCOM confirms](https://www.agcom.it/node/46091/printable/print) that obligations for covered pornography providers established elsewhere in the EU took effect February 1, 2026. Switzerland's [Federal Council answer 25.4615](https://ws-old.parlament.ch/affairs/20254615) describes age checks for covered pornography platforms. Frankfurt already produced the unwanted experience. These are stronger reasons to favor a Stockholm trial than Milan's small geographic advantage.

### Scope of the location comparison

This recommendation assumes reuse of the current **full AWS region** deployment. [AWS's region catalog](https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html) includes Milan, Zurich, Stockholm and Frankfurt, but no full region in Athens, Sofia or Bucharest. Those cities are geographically closer alternatives worth separately assessing if changing hosting providers is acceptable; neither their current adult-site policies nor UAE routing has been validated here. Local Zones are a separate offering, not interchangeable regional deployment targets. Stockholm does not require regional opt-in; normal launch preflight still applies.

The earlier Tel Aviv recommendation is withdrawn following Anthony's explicit exclusion. Its geographic advantage and the OECD's dated absence-of-age-assurance finding do not override the owner's concern about the visible destination of a long-lived connection. No claim about differential ISP monitoring was measured or independently verified.

### Remaining practical comparison

Stockholm now runs the one-host/two-protocol recipe alongside Cape Town; deployment and agent-run Mac checks are recorded in its launch evidence. Compare both exits from the same Dubai connection and device: connection responsiveness, sustained download/video use, packet loss and destination verification behavior. Verify the browser's observed exit because Private Relay may affect Safari. Both protocols share the host and regional path; inspect host utilization/CPU credits alongside the comparison if both remain slow. Record only non-sensitive performance numbers and pass/fail, not visited adult-site URLs. Promote the new exit only after the actual experience improves; switching remains manual; explicit regional lifecycle commands are documented separately.

## Requirement and evidence

Intended browsing, including adult content, must work without compulsory signup for age verification or supplying identity documents, selfies/biometrics or identity-linked verification credentials to destination sites or their verification vendors. Anthony confirmed that the encountered flow required signup. A successful tunnel does not establish this requirement. Record pass/fail without storing destination URLs or sensitive browsing history.

Germany's regulator KJM explains that online pornography must be restricted to adults through age-verification systems under the JMStV. This makes a German exit address a plausible cause of the reported prompt. Age verification does not necessarily disclose the user's identity to the adult site itself; the vendor/method still matters to the privacy requirement. [KJM explanation](https://www.kjm-online.de/themen/aufsicht-internet/pornografie/).

The triggering browser and verification details beyond compulsory signup are not yet confirmed. Private Relay remains enabled, so the visible location in Safari may differ from the EC2 exit. Determine the location seen by the affected browser before attributing this particular prompt to Germany. Site/account policies can impose checks independently of endpoint location. [Apple explains Private Relay’s separate exit address](https://support.apple.com/en-ie/102602).

## Digital-rights guidance

EFF warns that age-verification systems can expose identifying information, associate it with browsing and create breach risks. Open Rights Group's May 2026 joint statement with other organizations likewise warns against expanded age gates and their privacy consequences. These sources support the privacy requirement; neither cited publication supplies a country whitelist. Consult them for threat-model rationale, and current official sources for jurisdiction selection. [EFF brief](https://www.eff.org/files/2026/01/15/age_verification_one_pager_electronic_frontier_foundation.pdf), [Open Rights Group statement](https://www.openrightsgroup.org/press-releases/companies-and-civil-society-warn-that-uk-is-undermining-open-web/).

Do not reuse older country comparisons as current law. EFF's April 2025 EU analysis predates the Commission's March 2026 preliminary DSA findings against four major adult platforms. Those findings concern insufficient protection of minors and effective age verification; they do not establish that every EU website currently requires identity disclosure. [EFF EU analysis](https://www.eff.org/deeplinks/2025/04/digital-identities-and-future-age-verification-europe), [Commission findings](https://germany.representation.ec.europa.eu/nachrichten-und-veranstaltungen/pressemitteilungen/schutz-von-minderjahrigen-pornhub-stripchat-xnxx-und-xvideos-verstossen-gegen-das-gesetz-uber-2026-03-26_de).

## Previous selection and live deployment: Cape Town

The supplied report favors South Africa for internet openness and lower age-verification pressure. Its external citation tokens cannot be resolved from the imported file, so its absence-of-law finding remains attributed to that research. Independently consulted [Freedom House’s 2025 South Africa assessment](https://freedomhouse.org/country/south-africa/freedom-net/2025), which rates internet freedom Free, 73/100 and reports no website blocking. Neither this rating nor country choice guarantees a destination will omit verification. Anthony subsequently reported the Cape Town macOS and iOS practical trials passed; see [launch evidence](launch-cape-town.md). No quantitative Dubai performance benchmark or exhaustive legal guarantee follows from that report.

AWS account monitoring observed `af-south-1` transition from `ENABLING` to `ENABLED` after Anthony enabled it. Regional EC2 preflight then confirmed the pinned Canonical image, AZ and instance offering. [Deployment workflow](development.md) owns the commands; [Cape Town launch evidence](launch-cape-town.md) owns resulting resources and client checks.

## Earlier candidate assessment (2026-09-07 snapshot)


| Region | Evidence and assessment |
| --- | --- |
| Frankfurt | German adult-access verification requirements conflict with the desired experience; reconsider this endpoint location. |
| London | Not a suitable alternative for avoiding mandatory age checks: the UK requires strong checks for pornography. [Ofcom](https://www.ofcom.org.uk/agechecks). |
| Paris | Not a suitable alternative: France enforces age-verification obligations on covered adult sites. [Arcom](https://www.arcom.fr/en/press/online-pornography-new-steps-taken-protect-persons-under-18). |
| Zurich | Not an assured escape from age checks: the Swiss Federal Council's February 2026 answer states that covered providers, including pornography platforms, must check age, while acknowledging enforcement challenges. This is not a claim that every foreign site applies a Swiss identity check. [Parliamentary answer 25.4615](https://ws-old.parlament.ch/affairs/20254615). |
| Stockholm / other EU regions | Do not assume absence of national identity checks guarantees access: the EU enforcement described above also matters. Actual current site behavior is untested. |
| Canada Central (`ca-central-1`) | Previously proposed candidate; superseded by the owner-selected Cape Town trial. Parliament currently lists pornography bill S-209 at second reading in the Commons, not enacted. A changing policy landscape remains a risk. [S-209 status](https://www.parl.ca/legisinfo/en/bill/45-1/s-209). |

Canada also introduced Bill C-34 (Safe Social Media Act) on June 10, 2026; treat proposed measures separately from enacted obligations and recheck status before deployment. [Government proposal](https://www.canada.ca/en/canadian-heritage/services/safe-social-media-act.html), [Parliament status](https://www.parl.ca/legisinfo/en/bill/45-1/c-34). The AWS region identifier is confirmed in [AWS's region list](https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions.html).

Canada is farther from Dubai than Frankfurt; higher latency is an engineering expectation, not a measured result. Pending S-209 is evidence about that bill at the earlier review date, not an exhaustive finding that Canada has no relevant obligations. Canada was not selected. Cape Town passed the earlier practical trial but now fails the owner's everyday performance expectation; the new recommendation appears above.

## Independent deployment implications

Cape Town has independent regional AWS resources, an AMI/EIP, dedicated SSH key and fresh Amnezia runtime/profile identity. Frankfurt has been fully retired, including retained-EIP release. There is one host per live target; no automatic failover or lifecycle controller is needed. Future selectable/on-demand exits should reuse these boundaries. Deletion and retained-EIP cleanup require an explicit lifecycle decision, not an implicit consequence of changing the preferred region.
