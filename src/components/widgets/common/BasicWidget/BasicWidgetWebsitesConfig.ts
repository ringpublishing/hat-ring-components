import {
    AbstractWebsitesWidgetConfigDefaultParams,
    AbstractWebsitesWidgetConfigParamsDescription
} from "../../../../types/abstracts";

export let BasicWidgetWebsitesConfig = {
    "sections": [],
    "defaultParams": {},
    "paramsDescription": {},
    "modules": {
        "basicWidget_wdg": {
            "name": "Ring Basic",
            "description": "",
            "defaultParams": {
                ...AbstractWebsitesWidgetConfigDefaultParams,
                "customId": "",
                "generalShowOptions": ["sectionElements"],
                "showOptions": ["image", "title", "publicationDate", "lead"],
                "additionalOptions": [],
                "sectionGroup": "",
                "section_name": "",
                "listElements": [],
                "count": 10,
                "offset": 0,
                "countBig": 0,
                "columns": 1,
                "labelValue": "",
                "headerSeoTag": "h2",
                "labelLink": "",
                "description": "",
                "moreText": "",
                "moreUrl": "",
                "bigImageSize": "1200x660",
                "bigImageSizeMobile": "1200x660",
                "standardImageSize": "600x330",
                "standardImageSizeMobile": "600x330",
                "listElementsImageSize": "600x330",
                "listElementsImageSizeMobile": "600x330",
                "imageResizeCropMode": "cover",
                "preloadImagesCount": 0,
                "mobilePreloadImagesCount": 0,
                "titleAddonsCodeNames": "",
                "widgetType": "basicWidget",
                "customTeasers": [],
                "additionalComponents": []
            },
            "paramsDescription": {
                ...AbstractWebsitesWidgetConfigParamsDescription,
                "customId": {
                    "name": "Custom CSS ID",
                    "description": "id of the widget element, e.g. the target of a #anchor link",
                    "type": "textfield"
                },
                "generalShowOptions": {
                    "name": "Widget elements to display",
                    "description": "",
                    "type": "select",
                    "allowBlank": true,
                    "multiSelect": true,
                    "required": false,
                    "items": [
                        "sectionElements",
                        "listElements",
                        "header",
                        "description",
                        "button"
                    ]
                },
                "showOptions": {
                    "name": "Item elements to display",
                    "description": "",
                    "type": "select",
                    "allowBlank": true,
                    "multiSelect": true,
                    "required": false,
                    "items": [
                        "title",
                        "lead",
                        "image",
                        "publicationDate",
                        "modificationDate",
                        "authors",
                        "taxonomies",
                        "titleAddons"
                    ]
                },
                "additionalOptions": {
                    "name": "Additional options",
                    "description": "",
                    "type": "select",
                    "allowBlank": true,
                    "multiSelect": true,
                    "items": ["hideWhenNoSectionItems"],
                    "required": false
                },
                "sectionGroup": {
                    "name": "Section group",
                    "type": "textfield",
                    "description": "",
                    "required": false
                },
                "section_name": {
                    "name": "Section name",
                    "type": "textfield",
                    "description": "",
                    "required": false
                },
                "listElements": {
                    "type": "treeobject",
                    "name": "List elements",
                    "description": "List of static elements",
                    "required": false,
                    "properties": [
                        {
                            "name": "Title",
                            "type": "textfield"
                        },
                        {
                            "name": "Text",
                            "type": "textfield"
                        },
                        {
                            "name": "Description",
                            "type": "textfield"
                        },
                        {
                            "name": "Image src",
                            "type": "textfield"
                        },
                        {
                            "name": "Image dimensions (eg. 600x300)",
                            "type": "textfield"
                        },
                        {
                            "name": "Image src mobile",
                            "type": "textfield"
                        },
                        {
                            "name": "Image dimensions mobile (eg. 600x300)",
                            "type": "textfield"
                        },
                        {
                            "name": "Image alt attribute",
                            "type": "textfield"
                        },
                        {
                            "name": "Link url",
                            "type": "textfield"
                        },
                        {
                            "name": "Custom CSS Class",
                            "type": "textfield"
                        }
                    ]
                },
                "count": {
                    "name": "Elements",
                    "type": "textfield",
                    "description": "to display on page",
                    "required": false
                },
                "offset": {
                    "name": "Offset",
                    "type": "textfield",
                    "description": "elements to omit",
                    "required": false
                },
                "countBig": {
                    "name": "BIG elements",
                    "type": "textfield",
                    "description": "from 0 to 4",
                    "required": false
                },
                "columns": {
                    "name": "Columns",
                    "type": "textfield",
                    "description": "",
                    "allowBlank": false,
                    "multiSelect": false,
                    "required": true,
                    "items": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
                },
                "labelValue": {
                    "name": "Header",
                    "description": "empty field = dynamic header from page source",
                    "type": "textfield",
                    "required": false
                },
                "headerSeoTag": {
                    "name": "Header SEO tag",
                    "description": "",
                    "type": "select",
                    "allowBlank": false,
                    "multiSelect": false,
                    "required": true,
                    "items": [
                        "none",
                        "h1",
                        "h2",
                        "h3",
                        "h4",
                        "h5"
                    ]
                },
                "labelLink": {
                    "name": "Header url",
                    "description": "",
                    "type": "textfield",
                    "required": false
                },
                "description": {
                    "name": "Description",
                    "description": "",
                    "type": "textfield",
                    "required": false
                },
                "moreText": {
                    "name": "Button text",
                    "type": "textfield",
                    "description": "",
                    "required": false
                },
                "moreUrl": {
                    "name": "Button url",
                    "type": "textfield",
                    "description": "",
                    "required": false
                },
                "linkLabel": {
                    "name": "Link label inside section elements items",
                    "description": "",
                    "type": "textfield",
                    "required": false
                },
                "standardImageSize": {
                    "name": "Standard image resolution",
                    "type": "textfield",
                    "description": "empty = original, example: 600x330",
                    "required": false
                },
                "standardImageSizeMobile": {
                    "name": "Standard image resolution on mobile",
                    "type": "textfield",
                    "description": "empty = original, example: 600x330",
                    "required": false
                },
                "bigImageSize": {
                    "name": "Big image resolution",
                    "type": "textfield",
                    "description": "empty = original, example: 1200x660",
                    "required": false
                },
                "bigImageSizeMobile": {
                    "name": "Big image resolution on mobile",
                    "type": "textfield",
                    "description": "empty = original, example: 1200x660",
                    "required": false
                },
                "listElementsImageSize": {
                    "name": "List elements image resolution",
                    "type": "textfield",
                    "description": "empty = original, works with images from Ring CMS",
                    "required": false
                },
                "listElementsImageSizeMobile": {
                    "name": "List elements image resolution on mobile",
                    "type": "textfield",
                    "description": "empty = original, works with images from Ring CMS",
                    "required": false
                },
                "imageResizeCropMode": {
                    "name": "Image resize crop mode",
                    "type": "select",
                    "allowBlank": false,
                    "multiSelect": false,
                    "items": [
                        ["cover", "Cover - Fill whole box with image, cropping if necessary"],
                        ["contain", "Contain - Fit image within box, scaling image to fit without cropping"],
                    ],
                },
                "preloadImagesCount": {
                    "name": "Number of images that would be preloaded",
                    "type": "numberfield",
                    "description": "The number should correspond to the number of pictures the user sees first after entering the page",
                    "required": false
                },
                "mobilePreloadImagesCount": {
                    "name": "Number of images that would be preloaded on mobile",
                    "type": "numberfield",
                    "description": "The number should correspond to the number of pictures the user sees first after entering the page",
                    "required": false
                },
                "titleAddonsCodeNames": {
                    "name": "Title addons code names to show",
                    "description": "(comma separated code names)",
                    "type": "textfield"
                },
                "customTeasers": {
                    "type": "treeobject",
                    "name": "Custom teasers",
                    "description": "",
                    "properties": [
                        {
                            "name": "Teaser code name",
                            "type": "textfield"
                        },
                        {
                            "name": "For big image",
                            "type": "checkbox",
                        },
                        {
                            "name": "For mobile",
                            "type": "checkbox",
                        }
                    ]
                },
                "useOriginalImage": {
                    "name": "Use original image",
                    "type": "checkbox",
                    "description": "Use original image without cropping"
                },
                "cacheTTL": {
                    "name": "Cache TTL",
                    "description": "BasicWidget cache TTL in seconds",
                    "type": "numberfield"
                },
                "additionalComponents": {
                    "type": "treeobject",
                    "name": "Additional Components",
                    "description": "List of additional components",
                    "required": false,
                    "properties": [
                        {
                            "name": "widget",
                            "type": "textfield",
                            "description": "widget to insert e.g htmlInsert"
                        },
                        {
                            "name": "platformDesktop",
                            "description": "Desktop",
                            "type": "checkbox"
                        },
                        {
                            "name": "platformMobile",
                            "description": "Mobile",
                            "type": "checkbox"
                        },
                        {
                            "name": "customCssClass",
                            "description": "custom CSS class",
                            "type": "textfield"
                        },
                        {
                            "name": "limit",
                            "type": "textfield",
                            "description": "limit number of components"
                        },
                        {
                            "name": "pattern",
                            "type": "textfield",
                            "description": "Pattern for elements appearance: 'n' after every element, '2n+1' after every second element, 'n-1' before the first element, 'n+2' after the second element, etc. Use negative numbers to insert before elements. Negative multipliers are not supported."
                        },
                        {
                            "name": "config",
                            "type": "code",
                            "mode": "json"
                        },
                    ]
                },
            }
        }
    }
}
