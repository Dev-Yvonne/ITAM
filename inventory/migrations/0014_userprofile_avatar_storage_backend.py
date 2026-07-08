from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("inventory", "0013_userprofile_avatar_url"),
    ]

    operations = [
        migrations.AddField(
            model_name="userprofile",
            name="avatar_storage_backend",
            field=models.CharField(
                blank=True,
                choices=[("local", "Local"), ("supabase", "Supabase")],
                max_length=20,
            ),
        ),
    ]
