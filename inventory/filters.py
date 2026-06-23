from django import forms

from .models import Asset


class AssetFilterForm(forms.Form):
    type = forms.ChoiceField(required=False)
    status = forms.ChoiceField(required=False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["type"].choices = [("", "All Types"), *Asset.AssetType.choices]
        self.fields["status"].choices = [
            ("", "All Statuses"),
            *Asset.AssetStatus.choices,
        ]

    def filter_queryset(self, queryset):
        if not self.is_valid():
            return queryset

        asset_type = self.cleaned_data.get("type")
        status = self.cleaned_data.get("status")

        if asset_type:
            queryset = queryset.filter(type=asset_type)
        if status:
            queryset = queryset.filter(status=status)

        return queryset
