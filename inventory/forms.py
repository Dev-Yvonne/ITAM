from django import forms

from .models import Asset, Assignment, Employee, MaintenanceLog


class AssetForm(forms.ModelForm):
    class Meta:
        model = Asset
        fields = ["name", "type", "serial_number", "status"]

    def clean_serial_number(self) -> str:
        serial_number = self.cleaned_data["serial_number"]
        duplicate_assets = Asset.objects.filter(serial_number=serial_number)

        if self.instance.pk:
            duplicate_assets = duplicate_assets.exclude(pk=self.instance.pk)

        if duplicate_assets.exists():
            raise forms.ValidationError(
                "An asset with this serial number already exists."
            )

        return serial_number


class EmployeeForm(forms.ModelForm):
    class Meta:
        model = Employee
        fields = ["name", "department", "email"]


class AssignmentForm(forms.ModelForm):
    class Meta:
        model = Assignment
        fields = ["asset", "employee"]

    def clean_asset(self) -> Asset:
        asset = self.cleaned_data["asset"]

        has_active_assignment = Assignment.objects.filter(
            asset=asset,
            date_returned__isnull=True,
        ).exists()
        if asset.status != Asset.AssetStatus.AVAILABLE or has_active_assignment:
            raise forms.ValidationError("This asset is not available for assignment.") #add user friendly error tareting to point out to the specific err

        return asset


class MaintenanceLogForm(forms.ModelForm):
    class Meta:
        model = MaintenanceLog
        fields = ["asset", "issue_description", "technician", "date", "resolved"]

        #add user friendly error tareting to point out to the specific err

