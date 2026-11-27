import {
    AbstractWebsitesWidgetConfigDefaultParams,
    AbstractWebsitesWidgetConfigParamsDescription
} from "../../../../types/abstracts";

export let GooglePreferredSourceWebsitesConfig
    = {
    "sections": [],
    "defaultParams": {},
    "paramsDescription": {},
    "modules": {
        "googlePreferredSource_wdg": {
            "name": "Google Preferred Source",
            "description": "Link to add the publication as a preferred source in Google Search",
            "defaultParams": {
                ...AbstractWebsitesWidgetConfigDefaultParams,
                "text": "",
                "domain": "",
                "displayType": "link",
                "widgetType": "googlePreferredSource",
            },
            "paramsDescription": {
                ...AbstractWebsitesWidgetConfigParamsDescription,
                "displayType": {
                    "name": "Display type",
                    "description": "link: icon and text, styled by the site; button: rounded white button",
                    "type": "select",
                    "allowBlank": false,
                    "multiSelect": false,
                    "items": [
                        "link",
                        "button"
                    ]
                },
                "text": {
                    "name": "Text",
                    "description": "Empty: the translation (Translations) of \"Add as a preferred source on Google\" (link) or \"Add on Google\" (button) for the site language",
                    "type": "textfield"
                },
                "domain": {
                    "name": "Fallback domain",
                    "description": "Domain in the fallback link (google.com/preferences/source?q=...), used only when the Google script is not available. With the script, Google derives the site from the current page URL. Empty: the site domain without www.",
                    "type": "textfield"
                },
            }
        }
    }
}
