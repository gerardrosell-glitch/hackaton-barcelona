# Food-data and meal-photo provider decision

## Recommended beta stack

| Need | Recommendation | Reason | Procurement requirement |
| --- | --- | --- |
| Barcode and food search | FatSecret Platform API Premier | Its platform describes 2.3m verified foods, 58 country datasets, 26 languages, and broad EAN/UPC recognition; it is the strongest fit for a Europe-first product. | Obtain country-based Europe pricing, a DPA, permitted caching terms, and a Spain/France/Germany barcode benchmark. |
| Restaurant meal photo | LogMeal API | Barcelona-based specialist food-image API that returns editable food/ingredient/portion suggestions and nutrition indicators. | Require EU-only processing, a DPA, no-training/short-retention terms, and an enforceable deletion SLA. |
| Open food data | Do not merge into the production database | Open Food Facts is ODbL-licensed; combining it with proprietary data can impose attribution/share-alike obligations. | Legal approval and an ODbL-compliant data design are required before any use. |

## Product rules

- A barcode result is a product-data suggestion; users must verify product labels, especially allergens.
- A restaurant photo never produces a definitive calorie count. The user confirms foods and portions before totals change.
- EFSA dietary reference values are population references, not individual medical prescriptions. The app uses conservative estimates and routes clinical cases to a professional.

## Sources

- [FatSecret Platform API](https://platform.fatsecret.com/platform-api) and [editions/pricing model](https://platform.fatsecret.com/api-editions?cpc=true)
- [LogMeal API overview](https://docs.logmeal.com/docs/guides-getting-started-welcome-logmeal-api) and [privacy policy](https://logmeal.com/privacy/)
- [Open Food Facts API/data conditions](https://support.openfoodfacts.org/help/en-gb/12-donnees-api/94-y-a-t-il-des-conditions-pour-utiliser-l-api)
- [EFSA Dietary Reference Values](https://multimedia.efsa.europa.eu/drvs/index.htm?lang=en)
