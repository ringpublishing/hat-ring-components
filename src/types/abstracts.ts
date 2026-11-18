export const AbstractWebsitesWidgetConfigParamsDescription = {
    "widgetType": {
        "name": "widgetType",
        "description": "widget type (do not touch)",
        "type": "textfield",
        "required": true
    },
    "platformDesktop": {
        "name": "Desktop",
        "type": "checkbox",
        "description": "Desktop"
    },
    "platformMobile": {
        "name": "Mobile",
        "type": "checkbox",
        "description": "Mobile"
    },
    "customClass": {
        "name": "custom CSS class",
        "description": "custom CSS class",
        "type": "textfield"
    },
    "customPosition": {
        "name": "Custom position",
        "description": "(widget in BOX)",
        "type": "select",
        "allowBlank": false,
        "multiSelect": false,
        "items": [
            "none",
            "left",
            "center",
            "right"
        ]
    },
    "customWidth": {
        "name": "Custom width",
        "description": "(widget in BOX)",
        "type": "select",
        "allowBlank": false,
        "multiSelect": false,
        "items": ["none", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
        "required": false
    },
}

export const AbstractWebsitesWidgetConfigDefaultParams = {
    "platformDesktop": true,
    "platformMobile": true,
    "customClass": "",
    "customPosition": "none",
    "customWidth": "none"
}
