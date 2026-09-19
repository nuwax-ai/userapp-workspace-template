import unittest
from sqlalchemy.engine import make_url
from app.config import Settings

class CredentialRoundtripTests(unittest.TestCase):
    def test_credentials_are_not_form_encoded(self):
        for password in ("space password", "a+b@:/?#%", "quote'and\\slash"):
            settings = Settings(postgres_user="app user", postgres_password=password, postgres_db="appdb")
            decoded = make_url(settings.database_url)
            self.assertEqual(decoded.password, password)
            self.assertEqual(decoded.username, settings.postgres_user)
